import json
import httpx
from typing import AsyncGenerator, List, Dict, Any, Optional
from core.config import settings as app_settings

# ─── Provider model catalogues ────────────────────────────────────────────────

PROVIDER_MODELS: Dict[str, List[str]] = {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o3-mini"],
    "anthropic": [
        "claude-opus-4-8",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
    ],
    "grok": [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
    ],
    "openrouter": [],   # dynamic
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "ollama": [],       # dynamic — populated at runtime
    "gemini": [
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
    ],
}

PROVIDER_BASE_URLS: Dict[str, str] = {
    "openai":     "https://api.openai.com/v1",
    "grok":       "https://grok-api.apidog.io/",
    "openrouter": "https://openrouter.ai/api/v1",
    "deepseek":   "https://api.deepseek.com/v1",
}

# Known Grok model name fragments — anything else that looks like a local model
# goes to Ollama instead of being misidentified as Grok.
_GROK_SUFFIXES = {"versatile", "instant", "32768", "specdec"}


def _get_provider_for_model(model: str) -> str:
    """
    Determine which provider should handle a given model name.
    Priority: explicit catalogue lookup → name-prefix for cloud APIs → Ollama fallback.
    """
    # 1. Exact match in catalogue
    for provider, models in PROVIDER_MODELS.items():
        if model in models:
            return provider

    m = model.lower()

    # 2. Unambiguous cloud-provider prefixes
    if m.startswith("gpt-") or m.startswith("o1") or m.startswith("o3"):
        return "openai"
    if m.startswith("claude-"):
        return "anthropic"
    if m.startswith("gemini"):
        return "gemini"
    if m.startswith("deepseek"):
        return "deepseek"

    # 3. Grok: only if the model name contains a Grok-specific suffix
    #    (e.g. "llama-3.3-70b-versatile", "mixtral-8x7b-32768")
    if any(s in m for s in _GROK_SUFFIXES):
        return "grok"

    # 4. Everything else (llama3.2, mistral, gemma, phi, qwen, etc.)
    #    is assumed to be a locally-served Ollama model.
    return "ollama"


def get_available_providers(cfg=None, db_settings: Optional[Dict] = None) -> Dict[str, List[str]]:
    """
    Return a dict of provider → model list for every configured provider.
    Checks both env (cfg) and database settings (db_settings) for API keys.
    """
    if cfg is None:
        cfg = app_settings
    if db_settings is None:
        db_settings = {}

    def key(env_val, db_key):
        """Return the first non-empty key from env or DB."""
        return env_val or db_settings.get(db_key, "") or ""

    result: Dict[str, List[str]] = {}

    if key(cfg.openai_api_key, "openai_api_key"):
        result["openai"] = PROVIDER_MODELS["openai"]
    if key(cfg.anthropic_api_key, "anthropic_api_key"):
        result["anthropic"] = PROVIDER_MODELS["anthropic"]
    if key(cfg.grok_api_key, "grok_api_key"):
        result["grok"] = PROVIDER_MODELS["grok"]
    if key(cfg.openrouter_api_key, "openrouter_api_key"):
        result["openrouter"] = ["(fetch via /api/models/openrouter)"]
    if key(cfg.gemini_api_key, "gemini_api_key"):
        result["gemini"] = PROVIDER_MODELS["gemini"]
    if key(cfg.deepseek_api_key, "deepseek_api_key"):
        result["deepseek"] = PROVIDER_MODELS["deepseek"]

    # Ollama: always include if a host is set (localhost:11434 is a valid default)
    ollama_host = db_settings.get("ollama_host") or cfg.ollama_host or ""
    if ollama_host:
        result["ollama"] = []   # model list populated dynamically

    return result


# ─── Streaming helpers ────────────────────────────────────────────────────────

def _sse(content: str, done: bool = False, total_tokens: int = 0) -> str:
    if done:
        payload = json.dumps({"content": content, "done": True, "total_tokens": total_tokens})
    else:
        payload = json.dumps({"content": content, "done": False})
    return f"data: {payload}\n\n"


# ─── OpenAI-compatible streaming ──────────────────────────────────────────────

async def _stream_openai_compatible(
    base_url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    extra_headers: Optional[Dict[str, str]] = None,
) -> AsyncGenerator[str, None]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "max_tokens": 4096,
    }

    full_content = ""
    total_tokens = 0

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST", f"{base_url}/chat/completions", headers=headers, json=payload
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:]
                if raw.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                text = delta.get("content", "")
                if text:
                    full_content += text
                    yield _sse(text)
                usage = chunk.get("usage")
                if usage:
                    total_tokens = usage.get("total_tokens", 0)

    yield _sse("", done=True, total_tokens=total_tokens)


# ─── Anthropic streaming ──────────────────────────────────────────────────────

async def _stream_anthropic(
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    system_prompt: str = "",
) -> AsyncGenerator[str, None]:
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    filtered = [m for m in messages if m["role"] != "system"]
    payload: Dict[str, Any] = {
        "model": model,
        "max_tokens": 4096,
        "messages": filtered,
        "stream": True,
    }
    if system_prompt:
        payload["system"] = system_prompt

    total_tokens = 0

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    raw = line[6:]
                    try:
                        chunk = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    chunk_type = chunk.get("type", "")
                    if chunk_type == "content_block_delta":
                        delta = chunk.get("delta", {})
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                yield _sse(text)
                    elif chunk_type == "message_delta":
                        usage = chunk.get("usage", {})
                        total_tokens = usage.get("output_tokens", 0)

    yield _sse("", done=True, total_tokens=total_tokens)


# ─── Gemini streaming ─────────────────────────────────────────────────────────

async def _stream_gemini(
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    system_prompt: str = "",
) -> AsyncGenerator[str, None]:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:streamGenerateContent?key={api_key}&alt=sse"
    )
    contents = []
    for m in messages:
        role = m["role"]
        if role == "system":
            continue
        gemini_role = "user" if role == "user" else "model"
        contents.append({"role": gemini_role, "parts": [{"text": m["content"]}]})

    payload: Dict[str, Any] = {"contents": contents}
    if system_prompt:
        payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}

    total_tokens = 0

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:]
                try:
                    chunk = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                for candidate in chunk.get("candidates", []):
                    for part in candidate.get("content", {}).get("parts", []):
                        text = part.get("text", "")
                        if text:
                            yield _sse(text)
                usage = chunk.get("usageMetadata", {})
                total_tokens = usage.get("totalTokenCount", total_tokens)

    yield _sse("", done=True, total_tokens=total_tokens)


# ─── Public interface ─────────────────────────────────────────────────────────

async def stream_chat(
    provider: str,
    model: str,
    messages: List[Dict[str, str]],
    system_prompt: str = "",
    db_settings: Optional[Dict] = None,
    **kwargs,
) -> AsyncGenerator[str, None]:
    """
    Unified streaming entry point.
    db_settings overrides env-based keys so users can configure providers
    entirely within the app UI without touching .env.
    """
    cfg = app_settings
    db = db_settings or {}

    def k(env_val, db_key):
        return db.get(db_key) or env_val or ""

    if provider == "openai":
        api_key = k(cfg.openai_api_key, "openai_api_key")
        msgs = _prepend_system(messages, system_prompt)
        async for chunk in _stream_openai_compatible(
            PROVIDER_BASE_URLS["openai"], api_key, model, msgs
        ):
            yield chunk

    elif provider == "anthropic":
        api_key = k(cfg.anthropic_api_key, "anthropic_api_key")
        async for chunk in _stream_anthropic(api_key, model, messages, system_prompt):
            yield chunk

    elif provider == "grok":
        api_key = k(cfg.grok_api_key, "grok_api_key")
        msgs = _prepend_system(messages, system_prompt)
        async for chunk in _stream_openai_compatible(
            PROVIDER_BASE_URLS["grok"], api_key, model, msgs
        ):
            yield chunk

    elif provider == "openrouter":
        api_key = k(cfg.openrouter_api_key, "openrouter_api_key")
        msgs = _prepend_system(messages, system_prompt)
        extra = {"HTTP-Referer": "https://glyndwr.local", "X-Title": "Glyndwr"}
        async for chunk in _stream_openai_compatible(
            PROVIDER_BASE_URLS["openrouter"], api_key, model, msgs, extra_headers=extra
        ):
            yield chunk

    elif provider == "deepseek":
        api_key = k(cfg.deepseek_api_key, "deepseek_api_key")
        msgs = _prepend_system(messages, system_prompt)
        async for chunk in _stream_openai_compatible(
            PROVIDER_BASE_URLS["deepseek"], api_key, model, msgs
        ):
            yield chunk

    elif provider == "ollama":
        ollama_host = db.get("ollama_host") or cfg.ollama_host or "http://localhost:11434"
        ollama_base = f"{ollama_host}/v1"
        msgs = _prepend_system(messages, system_prompt)
        # Ollama's OpenAI-compatible endpoint accepts any non-empty key
        async for chunk in _stream_openai_compatible(ollama_base, "ollama", model, msgs):
            yield chunk

    elif provider == "gemini":
        api_key = k(cfg.gemini_api_key, "gemini_api_key")
        async for chunk in _stream_gemini(api_key, model, messages, system_prompt):
            yield chunk

    else:
        yield _sse(f"Unknown provider: {provider}", done=True)


def _prepend_system(
    messages: List[Dict[str, str]], system_prompt: str
) -> List[Dict[str, str]]:
    if not system_prompt:
        return messages
    if messages and messages[0].get("role") == "system":
        return messages
    return [{"role": "system", "content": system_prompt}] + list(messages)


# ─── Ollama model list ────────────────────────────────────────────────────────

async def list_ollama_models(host: Optional[str] = None) -> List[str]:
    if host is None:
        host = app_settings.ollama_host or "http://localhost:11434"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{host}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]
    except Exception:
        return []


async def test_provider_connection(
    provider: str, api_key: str, db_settings: Optional[Dict] = None
) -> Dict[str, Any]:
    db = db_settings or {}

    def k(db_key):
        return db.get(db_key) or api_key or ""

    try:
        if provider == "openai":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {k('openai_api_key')}"},
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "anthropic":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": k("anthropic_api_key"), "anthropic-version": "2023-06-01"},
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "grok":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://grok-api.apidog.io/openai/v1/models",
                    headers={"Authorization": f"Bearer {k('grok_api_key')}"},
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "gemini":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={k('gemini_api_key')}"
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "deepseek":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://api.deepseek.com/v1/models",
                    headers={"Authorization": f"Bearer {k('deepseek_api_key')}"},
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "openrouter":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {k('openrouter_api_key')}"},
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "ollama":
            host = db.get("ollama_host") or api_key or app_settings.ollama_host or "http://localhost:11434"
            models = await list_ollama_models(host)
            return {"ok": True, "models": models}
        else:
            return {"ok": False, "error": "Unknown provider"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

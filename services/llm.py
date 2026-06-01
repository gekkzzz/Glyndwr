import json
import httpx
from typing import AsyncGenerator, List, Dict, Any, Optional
from core.config import settings as app_settings

# ─── Provider model catalogues ────────────────────────────────────────────────

PROVIDER_MODELS: Dict[str, List[str]] = {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    "anthropic": [
        "claude-opus-4-8",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
    ],
    "groq": [
        "llama-3.3-70b-versatile",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
    ],
    "openrouter": [],  # dynamic
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "ollama": [],  # dynamic
    "gemini": [
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
    ],
}

PROVIDER_BASE_URLS: Dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "deepseek": "https://api.deepseek.com/v1",
}


def _get_provider_for_model(model: str) -> str:
    for provider, models in PROVIDER_MODELS.items():
        if model in models:
            return provider
    if model.startswith("gpt-") or model.startswith("o1") or model.startswith("o3"):
        return "openai"
    if model.startswith("claude-"):
        return "anthropic"
    if model.startswith("gemini"):
        return "gemini"
    if model.startswith("deepseek"):
        return "deepseek"
    if model.startswith("llama") or model.startswith("mistral") or model.startswith("mixtral") or model.startswith("phi") or model.startswith("qwen") or model.startswith("gemma"):
        return "groq"
    return "ollama"  # fallback for local models


def get_available_providers(cfg=None) -> Dict[str, List[str]]:
    if cfg is None:
        cfg = app_settings
    result: Dict[str, List[str]] = {}
    if cfg.openai_api_key:
        result["openai"] = PROVIDER_MODELS["openai"]
    if cfg.anthropic_api_key:
        result["anthropic"] = PROVIDER_MODELS["anthropic"]
    if cfg.groq_api_key:
        result["groq"] = PROVIDER_MODELS["groq"]
    if cfg.openrouter_api_key:
        result["openrouter"] = ["(fetch via /api/models/openrouter)"]
    if cfg.gemini_api_key:
        result["gemini"] = PROVIDER_MODELS["gemini"]
    if cfg.deepseek_api_key:
        result["deepseek"] = PROVIDER_MODELS["deepseek"]
    # Ollama is opt-in: only include if a host is explicitly configured
    if cfg.ollama_host and cfg.ollama_host != "http://localhost:11434":
        result["ollama"] = []
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
    # Filter out system messages – Anthropic uses a separate param
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
    # Convert messages to Gemini format
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
                candidates = chunk.get("candidates", [])
                for candidate in candidates:
                    parts = candidate.get("content", {}).get("parts", [])
                    for part in parts:
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
    **kwargs,
) -> AsyncGenerator[str, None]:
    """
    Unified streaming entry point.
    Yields SSE-formatted strings:
      data: {"content": "...", "done": false}
      data: {"content": "", "done": true, "total_tokens": N}
    """
    cfg = app_settings

    if provider == "openai":
        api_key = cfg.openai_api_key or ""
        msgs = _prepend_system(messages, system_prompt)
        async for chunk in _stream_openai_compatible(
            PROVIDER_BASE_URLS["openai"], api_key, model, msgs
        ):
            yield chunk

    elif provider == "anthropic":
        api_key = cfg.anthropic_api_key or ""
        async for chunk in _stream_anthropic(api_key, model, messages, system_prompt):
            yield chunk

    elif provider == "groq":
        api_key = cfg.groq_api_key or ""
        msgs = _prepend_system(messages, system_prompt)
        async for chunk in _stream_openai_compatible(
            PROVIDER_BASE_URLS["groq"], api_key, model, msgs
        ):
            yield chunk

    elif provider == "openrouter":
        api_key = cfg.openrouter_api_key or ""
        msgs = _prepend_system(messages, system_prompt)
        extra = {"HTTP-Referer": "https://glyndwr.local", "X-Title": "Glyndwr"}
        async for chunk in _stream_openai_compatible(
            PROVIDER_BASE_URLS["openrouter"], api_key, model, msgs, extra_headers=extra
        ):
            yield chunk

    elif provider == "deepseek":
        api_key = cfg.deepseek_api_key or ""
        msgs = _prepend_system(messages, system_prompt)
        async for chunk in _stream_openai_compatible(
            PROVIDER_BASE_URLS["deepseek"], api_key, model, msgs
        ):
            yield chunk

    elif provider == "ollama":
        ollama_base = f"{cfg.ollama_host}/v1"
        msgs = _prepend_system(messages, system_prompt)
        async for chunk in _stream_openai_compatible(ollama_base, "ollama", model, msgs):
            yield chunk

    elif provider == "gemini":
        api_key = cfg.gemini_api_key or ""
        async for chunk in _stream_gemini(api_key, model, messages, system_prompt):
            yield chunk

    else:
        yield _sse(f"Unknown provider: {provider}", done=True)


def _prepend_system(
    messages: List[Dict[str, str]], system_prompt: str
) -> List[Dict[str, str]]:
    """Prepend a system message if provided and not already present."""
    if not system_prompt:
        return messages
    if messages and messages[0].get("role") == "system":
        return messages
    return [{"role": "system", "content": system_prompt}] + list(messages)


# ─── Ollama model list ────────────────────────────────────────────────────────

async def list_ollama_models(host: Optional[str] = None) -> List[str]:
    if host is None:
        host = app_settings.ollama_host
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{host}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]
    except Exception:
        return []


async def test_provider_connection(provider: str, api_key: str) -> Dict[str, Any]:
    """Quick connectivity test for a provider."""
    try:
        if provider == "openai":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "anthropic":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "groq":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "gemini":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "deepseek":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://api.deepseek.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "openrouter":
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                return {"ok": r.status_code == 200, "status": r.status_code}
        elif provider == "ollama":
            models = await list_ollama_models(api_key or app_settings.ollama_host)
            return {"ok": True, "models": models}
        else:
            return {"ok": False, "error": "Unknown provider"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

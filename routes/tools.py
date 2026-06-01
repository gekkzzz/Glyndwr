"""
Agent tools API routes.
POST /api/tools/search   → SearXNG web search
POST /api/tools/fetch    → Fetch and extract text from a URL
POST /api/tools/exec     → Execute Python code in a sandbox
POST /api/tools/agent    → Agentic loop with tool use
GET  /api/tools/config   → Get tool configuration
"""
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from core.database import get_setting
from services.tools import web_search, fetch_url, run_code

router = APIRouter(prefix="/api/tools", tags=["tools"])


class SearchRequest(BaseModel):
    query: str
    num_results: int = 6


class FetchRequest(BaseModel):
    url: str


class ExecRequest(BaseModel):
    code: str
    language: str = "python"
    timeout: int = 15


class AgentRequest(BaseModel):
    message: str
    model: str
    history: List[Dict[str, str]] = []
    tools: List[str] = ["search", "fetch", "exec"]  # which tools to enable


@router.get("/config")
async def get_tool_config():
    searxng_url = await get_setting("searxng_url") or ""
    return {
        "searxng_url": searxng_url,
        "searxng_configured": bool(searxng_url),
        "code_exec_enabled": True,
    }


@router.post("/search")
async def search(req: SearchRequest):
    searxng_url = await get_setting("searxng_url") or ""
    results = await web_search(req.query, searxng_url, req.num_results)
    return {"results": results, "query": req.query}


@router.post("/fetch")
async def fetch(req: FetchRequest):
    result = await fetch_url(req.url)
    return result


@router.post("/exec")
async def execute_code(req: ExecRequest):
    result = await run_code(req.code, req.language, req.timeout)
    return result


@router.post("/agent")
async def agent_loop(req: AgentRequest):
    """
    Run an agentic tool-use loop with the selected model.
    Streams SSE events: status, tool_call, tool_result, chunk, done.
    """
    import httpx
    from core.database import get_setting as gs

    searxng_url = await gs("searxng_url") or ""
    api_key = ""
    base_url = "https://api.openai.com/v1"

    model = req.model
    if model.startswith("gpt") or model.startswith("o1"):
        from core.config import settings
        api_key = settings.openai_api_key or ""
    elif model.startswith("claude"):
        # Anthropic doesn't support OpenAI tool format directly; use basic mode
        from core.config import settings
        api_key = settings.anthropic_api_key or ""
        base_url = "https://api.anthropic.com"
    elif model.startswith("gemini"):
        from core.config import settings
        api_key = settings.gemini_api_key or ""
        base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
    else:
        from core.config import settings
        api_key = settings.openai_api_key or ""

    tools_def = []
    if "search" in req.tools and searxng_url:
        tools_def.append({
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web for information",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "The search query"},
                    },
                    "required": ["query"],
                },
            },
        })
    if "fetch" in req.tools:
        tools_def.append({
            "type": "function",
            "function": {
                "name": "fetch_url",
                "description": "Fetch and read the content of a web page",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "The URL to fetch"},
                    },
                    "required": ["url"],
                },
            },
        })
    if "exec" in req.tools:
        tools_def.append({
            "type": "function",
            "function": {
                "name": "run_code",
                "description": "Execute Python code and return the output",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string", "description": "Python code to execute"},
                    },
                    "required": ["code"],
                },
            },
        })

    system_msg = (
        "You are a capable AI agent with access to tools. "
        "Use tools to complete the user's request thoroughly. "
        "When you have enough information, provide a comprehensive final answer."
    )

    messages = [{"role": "system", "content": system_msg}]
    messages.extend(req.history)
    messages.append({"role": "user", "content": req.message})

    async def stream():
        nonlocal messages
        max_turns = 8

        for _ in range(max_turns):
            payload = {
                "model": model,
                "messages": messages,
                "stream": True,
            }
            if tools_def:
                payload["tools"] = tools_def
                payload["tool_choice"] = "auto"

            full_content = ""
            tool_calls_raw: List[Dict] = []

            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    async with client.stream(
                        "POST",
                        f"{base_url}/chat/completions",
                        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                        json=payload,
                    ) as r:
                        finish_reason = None
                        tc_buffer: Dict[int, Dict] = {}

                        async for line in r.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            chunk_str = line[6:]
                            if chunk_str == "[DONE]":
                                break
                            try:
                                chunk = json.loads(chunk_str)
                                delta = chunk["choices"][0].get("delta", {})
                                finish_reason = chunk["choices"][0].get("finish_reason")

                                if delta.get("content"):
                                    full_content += delta["content"]
                                    yield f"data: {json.dumps({'type': 'chunk', 'content': delta['content']})}\n\n"

                                for tc in delta.get("tool_calls", []):
                                    idx = tc.get("index", 0)
                                    if idx not in tc_buffer:
                                        tc_buffer[idx] = {"id": "", "function": {"name": "", "arguments": ""}}
                                    if tc.get("id"):
                                        tc_buffer[idx]["id"] = tc["id"]
                                    if tc.get("function", {}).get("name"):
                                        tc_buffer[idx]["function"]["name"] += tc["function"]["name"]
                                    if tc.get("function", {}).get("arguments"):
                                        tc_buffer[idx]["function"]["arguments"] += tc["function"]["arguments"]
                            except Exception:
                                pass

                        tool_calls_raw = list(tc_buffer.values()) if tc_buffer else []

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
                break

            if not tool_calls_raw:
                messages.append({"role": "assistant", "content": full_content})
                break

            messages.append({"role": "assistant", "content": full_content or None, "tool_calls": [
                {"id": tc["id"], "type": "function", "function": {"name": tc["function"]["name"], "arguments": tc["function"]["arguments"]}}
                for tc in tool_calls_raw
            ]})

            for tc in tool_calls_raw:
                fn_name = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"]["arguments"])
                except Exception:
                    args = {}

                yield f"data: {json.dumps({'type': 'tool_call', 'tool': fn_name, 'args': args})}\n\n"

                result_str = ""
                try:
                    if fn_name == "web_search":
                        results = await web_search(args.get("query", ""), searxng_url)
                        result_str = json.dumps(results)
                    elif fn_name == "fetch_url":
                        page = await fetch_url(args.get("url", ""))
                        result_str = page.get("content", page.get("error", ""))[:4000]
                    elif fn_name == "run_code":
                        out = await run_code(args.get("code", ""))
                        result_str = f"stdout:\n{out['stdout']}\nstderr:\n{out['stderr']}"
                    else:
                        result_str = f"Unknown tool: {fn_name}"
                except Exception as e:
                    result_str = f"Tool error: {e}"

                yield f"data: {json.dumps({'type': 'tool_result', 'tool': fn_name, 'result': result_str[:2000]})}\n\n"
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result_str[:4000]})

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")

"""
Deep Research routes — inspired by Tongyi DeepResearch pipeline.
POST /api/research/run  → Stream a deep research session
"""
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from core.database import get_setting, get_all_settings
from core.config import settings as app_settings
from services.llm import _get_provider_for_model, PROVIDER_BASE_URLS

router = APIRouter(prefix="/api/research", tags=["research"])


class ResearchRequest(BaseModel):
    question: str
    model: str = "gpt-4o-mini"
    num_queries: int = 3


def _resolve_api(model: str, db_settings: dict) -> tuple[str, str]:
    """Return (api_key, base_url) for the given model, checking DB then env."""
    def k(db_key, env_val):
        return db_settings.get(db_key) or env_val or ""

    provider = _get_provider_for_model(model)
    if provider == "openai":
        return k("openai_api_key", app_settings.openai_api_key), PROVIDER_BASE_URLS["openai"]
    if provider == "anthropic":
        return k("anthropic_api_key", app_settings.anthropic_api_key), "https://api.anthropic.com/v1"
    if provider == "groq":
        return k("groq_api_key", app_settings.groq_api_key), PROVIDER_BASE_URLS["groq"]
    if provider == "deepseek":
        return k("deepseek_api_key", app_settings.deepseek_api_key), PROVIDER_BASE_URLS["deepseek"]
    if provider == "openrouter":
        return k("openrouter_api_key", app_settings.openrouter_api_key), PROVIDER_BASE_URLS["openrouter"]
    if provider == "gemini":
        return k("gemini_api_key", app_settings.gemini_api_key), "https://generativelanguage.googleapis.com/v1beta/openai"
    if provider == "ollama":
        host = db_settings.get("ollama_host") or app_settings.ollama_host or "http://localhost:11434"
        return "ollama", f"{host}/v1"
    return "", PROVIDER_BASE_URLS["openai"]


@router.post("/run")
async def run_research(req: ResearchRequest):
    db_settings = await get_all_settings()
    searxng_url = db_settings.get("searxng_url") or ""

    if not searxng_url:
        raise HTTPException(
            status_code=400,
            detail="SearXNG URL not configured. Set it in Settings → Tools."
        )

    api_key, base_url = _resolve_api(req.model, db_settings)
    if not api_key:
        raise HTTPException(status_code=400, detail=f"No API key configured for model '{req.model}'.")

    from services.research import deep_research

    async def stream():
        async for event in deep_research(
            question=req.question,
            model=req.model,
            api_key=api_key,
            base_url=base_url,
            searxng_url=searxng_url,
            num_queries=req.num_queries,
        ):
            yield f"data: {event}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")

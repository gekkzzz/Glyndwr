"""
Deep Research routes.
POST /api/research/run  → Stream a deep research session
"""
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from core.database import get_setting
from core.config import settings as app_settings

router = APIRouter(prefix="/api/research", tags=["research"])


class ResearchRequest(BaseModel):
    question: str
    model: str = "gpt-4o-mini"
    num_queries: int = 3


@router.post("/run")
async def run_research(req: ResearchRequest):
    searxng_url = await get_setting("searxng_url") or ""
    if not searxng_url:
        raise HTTPException(
            status_code=400,
            detail="SearXNG URL not configured. Set it in Settings → Tools to enable Deep Research."
        )

    model = req.model
    api_key = app_settings.openai_api_key or ""
    base_url = "https://api.openai.com/v1"

    if model.startswith("claude"):
        api_key = app_settings.anthropic_api_key or ""
        base_url = "https://api.anthropic.com/v1"
    elif model.startswith("gemini"):
        api_key = app_settings.gemini_api_key or ""
        base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
    elif model.startswith("llama") or model.startswith("mixtral") or model.startswith("gemma"):
        api_key = app_settings.groq_api_key or ""
        base_url = "https://api.groq.com/openai/v1"
    elif model.startswith("deepseek"):
        api_key = app_settings.deepseek_api_key or ""
        base_url = "https://api.deepseek.com/v1"

    if not api_key:
        raise HTTPException(status_code=400, detail=f"No API key configured for model {model}")

    from services.research import deep_research

    async def stream():
        async for event in deep_research(
            question=req.question,
            model=model,
            api_key=api_key,
            base_url=base_url,
            searxng_url=searxng_url,
            num_queries=req.num_queries,
        ):
            yield f"data: {event}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")

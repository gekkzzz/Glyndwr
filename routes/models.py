from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services.llm import (
    get_available_providers,
    list_ollama_models,
    test_provider_connection,
    PROVIDER_MODELS,
)
from core.config import settings as app_settings

router = APIRouter(prefix="/api/models", tags=["models"])


class TestConnectionRequest(BaseModel):
    provider: str
    api_key: str
    host: Optional[str] = None


@router.get("/")
async def get_models():
    """Return all available models grouped by provider."""
    providers = get_available_providers()

    # Enrich Ollama models from live instance
    ollama_models = await list_ollama_models()
    if ollama_models:
        providers["ollama"] = ollama_models
    else:
        providers["ollama"] = []

    return {
        "providers": providers,
        "all_models": PROVIDER_MODELS,
    }


@router.get("/ollama")
async def get_ollama_models():
    """List available Ollama models from local instance."""
    host = app_settings.ollama_host or "http://localhost:11434"
    models = await list_ollama_models(host)
    return {"models": models, "host": host}


@router.post("/test")
async def test_connection(body: TestConnectionRequest):
    """Test provider connectivity with the given API key."""
    key = body.api_key
    if body.provider == "ollama":
        key = body.host or app_settings.ollama_host or "http://localhost:11434"
    result = await test_provider_connection(body.provider, key)
    return result

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
from core import database as db

router = APIRouter(prefix="/api/models", tags=["models"])


class TestConnectionRequest(BaseModel):
    provider: str
    api_key: str
    host: Optional[str] = None


@router.get("/")
async def get_models():
    """Return all available models grouped by provider, merging env + DB keys."""
    db_settings = await db.get_all_settings()
    providers = get_available_providers(db_settings=db_settings)

    # Ollama host: DB setting takes priority, then env
    ollama_host = db_settings.get("ollama_host") or app_settings.ollama_host or "http://localhost:11434"
    ollama_models = await list_ollama_models(ollama_host)
    if ollama_models:
        providers["ollama"] = ollama_models
    elif "ollama" in providers:
        providers["ollama"] = []

    return {
        "providers": providers,
        "all_models": PROVIDER_MODELS,
    }


@router.get("/ollama")
async def get_ollama_models():
    """List available Ollama models from the configured instance."""
    db_settings = await db.get_all_settings()
    host = db_settings.get("ollama_host") or app_settings.ollama_host or "http://localhost:11434"
    models = await list_ollama_models(host)
    return {"models": models, "host": host}


@router.post("/test")
async def test_connection(body: TestConnectionRequest):
    """Test provider connectivity — checks DB settings too."""
    db_settings = await db.get_all_settings()
    key = body.api_key
    if body.provider == "ollama":
        key = body.host or db_settings.get("ollama_host") or app_settings.ollama_host or "http://localhost:11434"
    result = await test_provider_connection(body.provider, key, db_settings=db_settings)
    return result

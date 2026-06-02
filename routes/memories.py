"""
Memories routes — persistent knowledge base.
Memories are extracted automatically from chats (AI-summarised) and can
also be added, edited, or deleted manually by the user.
"""
import json
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional

from core.database import (
    get_memories, create_memory, delete_memory, clear_memories,
    get_all_settings, get_messages,
)
from services.llm import _get_provider_for_model, stream_chat

router = APIRouter(prefix="/api/memories", tags=["memories"])


class MemoryCreateRequest(BaseModel):
    title: str
    content: str
    category: str = "general"
    confidence: int = 100
    source: str = "manual"


class MemoryUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    confidence: Optional[int] = None


class ExtractRequest(BaseModel):
    conversation_id: str
    model: str = "gpt-4o-mini"


@router.get("/")
async def list_memories(search: Optional[str] = Query(None)):
    return await get_memories(search=search)


@router.post("/")
async def create_memory_endpoint(body: MemoryCreateRequest):
    mem = await create_memory(
        title=body.title, content=body.content,
        category=body.category, confidence=body.confidence, source=body.source,
    )
    return mem


@router.put("/{mem_id}")
async def update_memory_endpoint(mem_id: str, body: MemoryUpdateRequest):
    import aiosqlite
    from core.database import DB_PATH
    from datetime import datetime
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = datetime.utcnow().isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [mem_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE memories SET {set_clause} WHERE id = ?", values)
        await db.commit()
    mems = await get_memories()
    mem = next((m for m in mems if m["id"] == mem_id), None)
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found")
    return mem


@router.delete("/all")
async def clear_all_memories():
    await clear_memories()
    return {"ok": True}


@router.delete("/{mem_id}")
async def delete_memory_endpoint(mem_id: str):
    await delete_memory(mem_id)
    return {"ok": True}


@router.post("/extract")
async def extract_from_conversation(body: ExtractRequest):
    """
    Use the LLM to extract memorable facts from a conversation
    and store them as individual memory entries.
    """

    messages = await get_messages(body.conversation_id)
    if not messages:
        return {"extracted": 0}

    # Build conversation text (last 20 messages to stay within context)
    convo = "\n".join(
        f"{m['role'].upper()}: {m['content']}"
        for m in messages[-20:]
        if m["role"] in ("user", "assistant")
    )

    db_settings = await get_all_settings()
    from core.config import settings as app_settings

    def k(db_key, env_val):
        return db_settings.get(db_key) or env_val or ""

    provider = _get_provider_for_model(body.model)
    if provider == "ollama":
        api_key = "ollama"
        host = db_settings.get("ollama_host") or app_settings.ollama_host or "http://localhost:11434"
        db_settings = {**db_settings, "ollama_host": host}
    elif provider == "openai":
        api_key = k("openai_api_key", app_settings.openai_api_key)
    elif provider == "grok":
        api_key = k("grok_api_key", app_settings.grok_api_key)
    elif provider == "anthropic":
        api_key = k("anthropic_api_key", app_settings.anthropic_api_key)
    elif provider == "gemini":
        api_key = k("gemini_api_key", app_settings.gemini_api_key)
    elif provider == "openrouter":
        api_key = k("openrouter_api_key", app_settings.openrouter_api_key)
    elif provider == "deepseek":
        api_key = k("deepseek_api_key", app_settings.deepseek_api_key)
    else:
        api_key = k("openai_api_key", app_settings.openai_api_key)

    if provider != "ollama" and not api_key:
        raise HTTPException(status_code=400, detail="No API key configured for memory extraction.")

    system = (
        "You extract memorable facts from a conversation. "
        "Return a JSON array of objects, each with: "
        "title (short, ≤8 words), content (1-2 sentence summary), "
        "category (one of: fact, preference, contact, project, goal, general), "
        "confidence (50-100). "
        "Only include things worth remembering long-term. Return [] if nothing notable. "
        "Return ONLY the JSON array, no other text."
    )

    prompt = f"Extract memorable facts from this conversation:\n\n{convo}"

    try:
        full_response = ""
        async for chunk in stream_chat(
            provider=provider,
            model=body.model,
            messages=[{"role": "user", "content": prompt}],
            system_prompt=system,
            db_settings=db_settings,
        ):
            if not chunk.startswith("data: "):
                continue
            payload = json.loads(chunk[6:])
            if payload.get("done"):
                continue
            full_response += payload.get("content", "")

        text = full_response.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        facts = json.loads(text.strip())

        saved = 0
        for fact in facts:
            if isinstance(fact, dict) and fact.get("title") and fact.get("content"):
                await create_memory(
                    title=fact["title"],
                    content=fact["content"],
                    category=fact.get("category", "general"),
                    confidence=int(fact.get("confidence", 80)),
                    source=f"conv:{body.conversation_id}",
                )
                saved += 1

        return {"extracted": saved}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

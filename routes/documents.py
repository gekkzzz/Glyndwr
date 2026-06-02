"""
Documents: multi-tab editor stored in the DB.
GET    /api/documents/         → list documents
POST   /api/documents/         → create document
GET    /api/documents/{id}     → get document
PUT    /api/documents/{id}     → update document
DELETE /api/documents/{id}     → delete document
POST   /api/documents/{id}/ai  → AI assistance on document content
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime
import json

import aiosqlite
from core.database import DB_PATH

router = APIRouter(prefix="/api/documents", tags=["documents"])


def _now():
    return datetime.utcnow().isoformat()


async def _ensure_table():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'Untitled',
                content TEXT NOT NULL DEFAULT '',
                format TEXT NOT NULL DEFAULT 'markdown',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        await db.commit()


class DocCreate(BaseModel):
    title: str = "Untitled"
    content: str = ""
    format: str = "markdown"  # markdown | html | csv | plain


class DocUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    format: Optional[str] = None


class AIAssistRequest(BaseModel):
    action: str  # improve | summarize | expand | translate | fix_grammar | explain
    selection: str = ""  # selected text (empty = whole document)
    context: str = ""    # surrounding context
    model: str = ""
    instruction: str = ""  # custom instruction for 'custom' action


@router.get("/")
async def list_documents() -> List[Dict[str, Any]]:
    await _ensure_table()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, title, format, created_at, updated_at, substr(content,1,120) as preview FROM documents ORDER BY updated_at DESC"
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


@router.post("/")
async def create_document(data: DocCreate) -> Dict[str, Any]:
    await _ensure_table()
    doc_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO documents (id, title, content, format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (doc_id, data.title, data.content, data.format, now, now),
        )
        await db.commit()
    return {"id": doc_id, "title": data.title, "content": data.content, "format": data.format, "created_at": now, "updated_at": now}


@router.get("/{doc_id}")
async def get_document(doc_id: str) -> Dict[str, Any]:
    await _ensure_table()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)) as cur:
            row = await cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Document not found")
            return dict(row)


@router.put("/{doc_id}")
async def update_document(doc_id: str, data: DocUpdate) -> Dict[str, Any]:
    await _ensure_table()
    updates = {"updated_at": _now()}
    for field in ("title", "content", "format"):
        val = getattr(data, field)
        if val is not None:
            updates[field] = val
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [doc_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE documents SET {set_clause} WHERE id = ?", values)
        await db.commit()
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)) as cur:
            row = await cur.fetchone()
            return dict(row) if row else {}


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    await _ensure_table()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        await db.commit()
    return {"ok": True, "id": doc_id}


@router.post("/{doc_id}/ai")
async def ai_assist(doc_id: str, req: AIAssistRequest):
    """Stream AI-assisted edits/suggestions for document content.

    Uses the same provider-routing and DB-settings lookup as the chat
    endpoint, so Ollama, OpenRouter, DeepSeek, etc. all work out of the box.
    """
    from core import database as db_module
    from services.llm import stream_chat, _get_provider_for_model

    model = req.model or "gpt-4o-mini"
    provider = _get_provider_for_model(model)

    # Pull API keys / Ollama host from the database (where the UI saves them)
    db_settings = await db_module.get_all_settings()

    # Quick sanity check: make sure the resolved provider actually has credentials
    def _has_creds(p: str) -> bool:
        from core.config import settings as cfg
        key_map = {
            "openai":     ("openai_api_key",     cfg.openai_api_key),
            "anthropic":  ("anthropic_api_key",  cfg.anthropic_api_key),
            "grok":       ("grok_api_key",        cfg.grok_api_key),
            "gemini":     ("gemini_api_key",      cfg.gemini_api_key),
            "deepseek":   ("deepseek_api_key",    cfg.deepseek_api_key),
            "openrouter": ("openrouter_api_key",  cfg.openrouter_api_key),
            "ollama":     ("ollama_host",         cfg.ollama_host),
        }
        if p not in key_map:
            return False
        db_key, env_val = key_map[p]
        return bool(db_settings.get(db_key) or env_val)

    if not _has_creds(provider):
        raise HTTPException(
            status_code=400,
            detail=f"No credentials configured for provider '{provider}' (model: {model}). "
                   f"Add your API key in Settings → Providers.",
        )

    text = req.selection or req.context
    action_prompts = {
        "improve":     f"Improve the writing of this text. Keep the same meaning but make it clearer and more engaging:\n\n{text}",
        "summarize":   f"Write a concise summary of this text:\n\n{text}",
        "expand":      f"Expand this text with more detail and depth:\n\n{text}",
        "translate":   f"Translate this text to English (or if already English, to Spanish):\n\n{text}",
        "fix_grammar": f"Fix any grammar, spelling, punctuation and style errors in this text. Return only the corrected text:\n\n{text}",
        "explain":     f"Explain the concepts in this text in clear, simple terms:\n\n{text}",
        "custom":      f"{req.instruction}:\n\n{text}",
    }
    prompt = action_prompts.get(req.action, action_prompts["improve"])
    messages = [{"role": "user", "content": prompt}]

    async def stream():
        try:
            async for chunk in stream_chat(
                provider=provider,
                model=model,
                messages=messages,
                system_prompt="You are a helpful writing assistant. Return only the requested output — no preamble, no meta-commentary.",
                db_settings=db_settings,
            ):
                yield chunk
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")

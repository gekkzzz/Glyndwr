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
    """Stream AI-assisted edits/suggestions for document content."""
    import httpx
    from core.config import settings

    model = req.model or "gpt-4o-mini"
    api_key = settings.openai_api_key or ""
    base_url = "https://api.openai.com/v1"

    if model.startswith("claude"):
        api_key = settings.anthropic_api_key or ""
    elif model.startswith("gemini"):
        api_key = settings.gemini_api_key or ""
        base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
    elif model.startswith("llama") or model.startswith("mixtral"):
        api_key = settings.grok_api_key or ""
        base_url = "https://grok-api.apidog.io/openai/v1"

    if not api_key:
        raise HTTPException(status_code=400, detail="No API key configured")

    text = req.selection or req.context
    action_prompts = {
        "improve": f"Improve the writing of this text. Keep the same meaning but make it clearer and more engaging:\n\n{text}",
        "summarize": f"Write a concise summary of this text:\n\n{text}",
        "expand": f"Expand this text with more detail and depth:\n\n{text}",
        "translate": f"Translate this text to English (or if already English, to Spanish):\n\n{text}",
        "fix_grammar": f"Fix any grammar, spelling and punctuation errors in this text:\n\n{text}",
        "explain": f"Explain this text in simple terms:\n\n{text}",
        "custom": f"{req.instruction}:\n\n{text}",
    }

    prompt = action_prompts.get(req.action, action_prompts["improve"])

    async def stream():
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": model, "messages": [{"role": "user", "content": prompt}], "stream": True},
                ) as r:
                    async for line in r.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        chunk_str = line[6:]
                        if chunk_str == "[DONE]":
                            yield f"data: {json.dumps({'done': True})}\n\n"
                            break
                        try:
                            chunk = json.loads(chunk_str)
                            content = chunk["choices"][0]["delta"].get("content", "")
                            if content:
                                yield f"data: {json.dumps({'content': content})}\n\n"
                        except Exception:
                            pass
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")

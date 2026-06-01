from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime

from core.database import DB_PATH
import aiosqlite

router = APIRouter(prefix="/api/notes", tags=["notes"])


def _now() -> str:
    return datetime.utcnow().isoformat()


class NoteCreate(BaseModel):
    title: str = "Untitled"
    content: str = ""


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


@router.get("/")
async def list_notes() -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, title, substr(content, 1, 120) as preview, created_at, updated_at "
            "FROM notes ORDER BY updated_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


@router.post("/")
async def create_note(data: NoteCreate) -> Dict[str, Any]:
    note_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (note_id, data.title, data.content, now, now),
        )
        await db.commit()
    return {
        "id": note_id,
        "title": data.title,
        "content": data.content,
        "created_at": now,
        "updated_at": now,
    }


@router.get("/{note_id}")
async def get_note(note_id: str) -> Dict[str, Any]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM notes WHERE id = ?", (note_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Note not found")
            return dict(row)


@router.put("/{note_id}")
async def update_note(note_id: str, data: NoteUpdate) -> Dict[str, Any]:
    now = _now()
    updates: Dict[str, Any] = {"updated_at": now}
    if data.title is not None:
        updates["title"] = data.title
    if data.content is not None:
        updates["content"] = data.content

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [note_id]

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE notes SET {set_clause} WHERE id = ?", values)
        await db.commit()

    return await get_note(note_id)


@router.delete("/{note_id}")
async def delete_note(note_id: str) -> Dict[str, Any]:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        await db.commit()
    return {"ok": True, "id": note_id}

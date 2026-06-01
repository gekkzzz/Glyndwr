from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime

from core.database import DB_PATH
import aiosqlite

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _now() -> str:
    return datetime.utcnow().isoformat()


class TaskCreate(BaseModel):
    text: str
    sort_order: int = 0
    due_date: Optional[str] = None  # ISO date string YYYY-MM-DD


class TaskUpdate(BaseModel):
    text: Optional[str] = None
    done: Optional[bool] = None
    sort_order: Optional[int] = None
    due_date: Optional[str] = None  # ISO date string or "" to clear


@router.get("/")
async def list_tasks(done: Optional[bool] = None) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if done is None:
            async with db.execute(
                "SELECT * FROM tasks ORDER BY sort_order ASC, created_at ASC"
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM tasks WHERE done = ? ORDER BY sort_order ASC, created_at ASC",
                (1 if done else 0,),
            ) as cursor:
                rows = await cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["done"] = bool(d["done"])
            result.append(d)
        return result


@router.post("/")
async def create_task(data: TaskCreate) -> Dict[str, Any]:
    task_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO tasks (id, text, done, created_at, updated_at, sort_order, due_date) VALUES (?, ?, 0, ?, ?, ?, ?)",
            (task_id, data.text, now, now, data.sort_order, data.due_date),
        )
        await db.commit()
    return {
        "id": task_id,
        "text": data.text,
        "done": False,
        "created_at": now,
        "updated_at": now,
        "sort_order": data.sort_order,
        "due_date": data.due_date,
    }


@router.put("/{task_id}")
async def update_task(task_id: str, data: TaskUpdate) -> Dict[str, Any]:
    now = _now()
    updates: Dict[str, Any] = {"updated_at": now}
    if data.text is not None:
        updates["text"] = data.text
    if data.done is not None:
        updates["done"] = 1 if data.done else 0
    if data.sort_order is not None:
        updates["sort_order"] = data.sort_order
    if data.due_date is not None:
        updates["due_date"] = data.due_date or None

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [task_id]

    async with aiosqlite.connect(DB_PATH) as db:
        result = await db.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)
        await db.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            d = dict(row)
            d["done"] = bool(d["done"])
            return d


@router.delete("/{task_id}")
async def delete_task(task_id: str) -> Dict[str, Any]:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        await db.commit()
    return {"ok": True, "id": task_id}

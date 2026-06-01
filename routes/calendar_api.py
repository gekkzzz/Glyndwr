"""
Calendar API: local events + CalDAV sync.
GET    /api/calendar/events          → list events
POST   /api/calendar/events          → create local event
PUT    /api/calendar/events/{id}     → update event
DELETE /api/calendar/events/{id}     → delete event
POST   /api/calendar/sync            → pull events from CalDAV
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime

import aiosqlite
from core.database import DB_PATH, get_setting

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _now():
    return datetime.utcnow().isoformat()


class EventCreate(BaseModel):
    title: str
    date: str         # YYYY-MM-DD
    time: str = ""    # HH:MM
    description: str = ""
    color: str = ""


class EventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


@router.get("/events")
async def list_events(month: Optional[str] = None) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if month:
            async with db.execute(
                "SELECT * FROM calendar_events WHERE date LIKE ? ORDER BY date ASC, time ASC",
                (f"{month}%",),
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]
        else:
            async with db.execute(
                "SELECT * FROM calendar_events ORDER BY date ASC, time ASC"
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]


@router.post("/events")
async def create_event(data: EventCreate) -> Dict[str, Any]:
    ev_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO calendar_events
               (id, title, date, time, description, color, source, caldav_uid, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'local', '', ?, ?)""",
            (ev_id, data.title, data.date, data.time, data.description, data.color, now, now),
        )
        await db.commit()
    return {"id": ev_id, "title": data.title, "date": data.date, "time": data.time,
            "description": data.description, "color": data.color, "source": "local"}


@router.put("/events/{ev_id}")
async def update_event(ev_id: str, data: EventUpdate) -> Dict[str, Any]:
    updates = {"updated_at": _now()}
    for field in ("title", "date", "time", "description", "color"):
        val = getattr(data, field)
        if val is not None:
            updates[field] = val
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [ev_id]
    async with aiosqlite.connect(DB_PATH) as db:
        res = await db.execute(f"UPDATE calendar_events SET {set_clause} WHERE id = ?", values)
        await db.commit()
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Event not found")
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM calendar_events WHERE id = ?", (ev_id,)) as cur:
            row = await cur.fetchone()
            return dict(row) if row else {}


@router.delete("/events/{ev_id}")
async def delete_event(ev_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM calendar_events WHERE id = ?", (ev_id,))
        await db.commit()
    return {"ok": True, "id": ev_id}


@router.post("/sync")
async def sync_caldav():
    """Pull events from configured CalDAV server and upsert into local DB."""
    caldav_url = await get_setting("caldav_url") or ""
    caldav_username = await get_setting("caldav_username") or ""
    caldav_password = await get_setting("caldav_password") or ""

    if not caldav_url:
        raise HTTPException(status_code=400, detail="CalDAV URL not configured. Set it in Settings → Calendar.")

    from services.caldav_service import fetch_events
    try:
        events = await fetch_events(caldav_url, caldav_username, caldav_password)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    now = _now()
    upserted = 0
    async with aiosqlite.connect(DB_PATH) as db:
        for ev in events:
            ev_id = str(uuid.uuid4())
            await db.execute(
                """INSERT INTO calendar_events
                   (id, title, date, time, description, color, source, caldav_uid, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, '', 'caldav', ?, ?, ?)
                   ON CONFLICT(caldav_uid) DO UPDATE SET
                     title=excluded.title, date=excluded.date, time=excluded.time,
                     description=excluded.description, updated_at=excluded.updated_at
                """.replace("ON CONFLICT(caldav_uid)", "ON CONFLICT DO NOTHING"),
                (ev_id, ev["title"], ev["date"], ev["time"], ev.get("description", ""),
                 ev["caldav_uid"], now, now),
            )
            upserted += 1
        await db.commit()

    return {"synced": upserted, "total": len(events)}

"""
Web Push notification routes.
GET  /api/notifications/vapid-public-key  → returns the VAPID public key
POST /api/notifications/subscribe         → store a push subscription
POST /api/notifications/test              → send a test notification
DELETE /api/notifications/subscribe       → remove a subscription
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uuid
from datetime import datetime

import aiosqlite
from core.database import DB_PATH, get_setting, set_setting
from services.push import generate_vapid_keys, send_push_notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


async def _ensure_vapid_keys() -> Dict[str, str]:
    pub = await get_setting("vapid_public_key")
    prv = await get_setting("vapid_private_key")
    if not pub or not prv:
        try:
            keys = generate_vapid_keys()
            await set_setting("vapid_public_key", keys["public_key"])
            await set_setting("vapid_private_key", keys["private_key"])
            return keys
        except Exception:
            return {"public_key": "", "private_key": ""}
    return {"public_key": pub, "private_key": prv}


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    keys = await _ensure_vapid_keys()
    return {"public_key": keys["public_key"]}


class PushSubscription(BaseModel):
    endpoint: str
    keys: Dict[str, str]  # {p256dh, auth}


@router.post("/subscribe")
async def subscribe(sub: PushSubscription):
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, created_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth""",
            (str(uuid.uuid4()), sub.endpoint, sub.keys.get("p256dh", ""), sub.keys.get("auth", ""), now),
        )
        await db.commit()
    return {"status": "subscribed"}


@router.delete("/subscribe")
async def unsubscribe(endpoint: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
        await db.commit()
    return {"status": "unsubscribed"}


class TestNotification(BaseModel):
    title: str = "Glyndwr"
    body: str = "Push notifications are working!"


@router.post("/test")
async def send_test(body: TestNotification):
    keys = await _ensure_vapid_keys()
    if not keys["public_key"]:
        raise HTTPException(status_code=500, detail="VAPID keys not available. Install cryptography: pip install cryptography")

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM push_subscriptions") as cur:
            subs = [dict(r) for r in await cur.fetchall()]

    if not subs:
        raise HTTPException(status_code=400, detail="No push subscriptions found. Enable notifications first.")

    sent = 0
    for sub in subs:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
        }
        ok = await send_push_notification(
            subscription=subscription_info,
            title=body.title,
            body=body.body,
            vapid_private_key=keys["private_key"],
            vapid_public_key=keys["public_key"],
        )
        if ok:
            sent += 1

    return {"sent": sent, "total": len(subs)}


@router.post("/send")
async def send_notification_to_all(title: str, body: str, tag: str = ""):
    """Internal route: send a push notification to all subscribers."""
    keys = await _ensure_vapid_keys()
    if not keys["public_key"]:
        return {"sent": 0, "error": "VAPID not configured"}

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM push_subscriptions") as cur:
            subs = [dict(r) for r in await cur.fetchall()]

    sent = 0
    for sub in subs:
        ok = await send_push_notification(
            subscription={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
            title=title,
            body=body,
            tag=tag,
            vapid_private_key=keys["private_key"],
            vapid_public_key=keys["public_key"],
        )
        if ok:
            sent += 1

    return {"sent": sent}

"""
Email routes: IMAP inbox, message bodies, subscription scanning, SMTP compose.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json
import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from core.database import get_setting, set_setting

router = APIRouter(prefix="/api/email", tags=["email"])


async def _get_imap_config():
    host = await get_setting("email_imap_host") or ""
    port = int(await get_setting("email_imap_port") or 993)
    username = await get_setting("email_imap_username") or ""
    password = await get_setting("email_imap_password") or ""
    return host, port, username, password


# ─── Inbox ────────────────────────────────────────────────────────────────────

@router.get("/inbox")
async def get_inbox(folder: str = "INBOX", limit: int = 50):
    host, port, username, password = await _get_imap_config()
    if not host or not username:
        return {"configured": False, "messages": [],
                "message": "Configure IMAP in Settings → Email to connect your inbox."}
    try:
        from services.imap_service import fetch_messages
        msgs = await fetch_messages(host, port, username, password, folder, limit)
        return {"configured": True, "messages": msgs, "folder": folder}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"IMAP error: {e}")


@router.get("/message/{uid}")
async def get_message(uid: str, folder: str = "INBOX"):
    host, port, username, password = await _get_imap_config()
    if not host or not username:
        raise HTTPException(status_code=400, detail="IMAP not configured")
    try:
        from services.imap_service import fetch_body
        body = await fetch_body(host, port, username, password, uid, folder)
        return body
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── AI Triage ────────────────────────────────────────────────────────────────

class TriageRequest(BaseModel):
    subject: str
    from_: str
    body_text: str
    model: str = ""


@router.post("/triage")
async def triage_email(req: TriageRequest):
    """Use the configured LLM to triage a single email."""
    import httpx
    from core.config import settings

    model = req.model or "gpt-4o-mini"
    api_key = settings.openai_api_key or ""
    base_url = "https://api.openai.com/v1"

    if model.startswith("claude"):
        api_key = settings.anthropic_api_key or ""
        # Anthropic needs different handling; fall back to summary only
    elif model.startswith("gemini"):
        api_key = settings.gemini_api_key or ""
        base_url = "https://generativelanguage.googleapis.com/v1beta/openai"

    if not api_key:
        raise HTTPException(status_code=400, detail="No API key configured for triage model")

    prompt = (
        f"Analyse this email and respond with a JSON object:\n"
        f"From: {req.from_}\nSubject: {req.subject}\n\n{req.body_text[:2000]}\n\n"
        f"Respond ONLY with valid JSON:\n"
        f'{{"urgency": "high|medium|low", "category": "work|personal|newsletter|finance|spam|other", '
        f'"summary": "one sentence summary", "suggested_reply": "short draft reply if appropriate or null"}}'
    )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 300},
            )
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            import re
            match = re.search(r'\{.*?\}', content, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            return {"urgency": "medium", "category": "other", "summary": content[:200], "suggested_reply": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Compose / Send ───────────────────────────────────────────────────────────

class ComposeRequest(BaseModel):
    to: str
    subject: str
    body: str
    reply_to_uid: Optional[str] = None


@router.post("/send")
async def send_email(req: ComposeRequest):
    smtp_host = await get_setting("email_smtp_host") or ""
    smtp_port = int(await get_setting("email_smtp_port") or 587)
    username = await get_setting("email_smtp_username") or ""
    password = await get_setting("email_smtp_password") or ""

    if not smtp_host or not username:
        raise HTTPException(status_code=400, detail="SMTP not configured")

    def _send():
        msg = MIMEMultipart()
        msg["From"] = username
        msg["To"] = req.to
        msg["Subject"] = req.subject
        msg.attach(MIMEText(req.body, "plain"))
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(username, password)
            s.send_message(msg)

    try:
        await asyncio.to_thread(_send)
        return {"status": "sent"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Subscription scanning ────────────────────────────────────────────────────

class UnsubscribeRequest(BaseModel):
    id: str


@router.get("/subscriptions")
async def get_subscriptions():
    host, port, username, password = await _get_imap_config()
    if not host or not username:
        return {"configured": False, "subscriptions": [],
                "message": "Configure IMAP in Settings → Email to enable inbox scanning."}

    blocked_raw = await get_setting("email_blocked_senders")
    blocked: list = json.loads(blocked_raw) if blocked_raw else []

    try:
        from services.imap_service import scan_subscriptions
        subs = await scan_subscriptions(host, port, username, password, limit=300)
        visible = [s for s in subs if s["id"] not in blocked]
        return {"configured": True, "subscriptions": visible, "blocked": blocked}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/unsubscribe")
async def block_sender(req: UnsubscribeRequest):
    blocked_raw = await get_setting("email_blocked_senders")
    blocked: list = json.loads(blocked_raw) if blocked_raw else []
    if req.id not in blocked:
        blocked.append(req.id)
        await set_setting("email_blocked_senders", json.dumps(blocked))
    return {"status": "blocked", "id": req.id}


@router.delete("/unsubscribe/{sender_id}")
async def unblock_sender(sender_id: str):
    blocked_raw = await get_setting("email_blocked_senders")
    blocked: list = json.loads(blocked_raw) if blocked_raw else []
    blocked = [b for b in blocked if b != sender_id]
    await set_setting("email_blocked_senders", json.dumps(blocked))
    return {"status": "unblocked", "id": sender_id}

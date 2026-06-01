"""
IMAP email service using Python's stdlib imaplib.
All blocking I/O is wrapped with asyncio.to_thread.
"""
import asyncio
import imaplib
import email
import re
from email.header import decode_header
from typing import List, Dict, Any, Optional


def _decode_str(raw) -> str:
    if raw is None:
        return ""
    parts = decode_header(raw if isinstance(raw, str) else raw.decode("utf-8", errors="replace"))
    result = []
    for chunk, charset in parts:
        if isinstance(chunk, bytes):
            result.append(chunk.decode(charset or "utf-8", errors="replace"))
        else:
            result.append(str(chunk))
    return "".join(result)


def _connect(host: str, port: int, username: str, password: str) -> imaplib.IMAP4_SSL:
    conn = imaplib.IMAP4_SSL(host, int(port))
    conn.login(username, password)
    return conn


# ─── Inbox ────────────────────────────────────────────────────────────────────

def _fetch_messages(host, port, username, password, folder="INBOX", limit=50) -> List[Dict[str, Any]]:
    conn = _connect(host, port, username, password)
    conn.select(folder, readonly=True)

    _, data = conn.search(None, "ALL")
    uids = data[0].split()
    uids = list(reversed(uids))[:limit]

    emails = []
    for uid in uids:
        try:
            _, raw_flags = conn.fetch(uid, "(FLAGS)")
            flags_str = raw_flags[0].decode("utf-8", errors="replace") if raw_flags[0] else ""
            seen = "\\Seen" in flags_str

            _, hdr_data = conn.fetch(uid, "(BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)])")
            if not hdr_data or not hdr_data[0]:
                continue
            raw_hdr = hdr_data[0][1] if isinstance(hdr_data[0], tuple) else hdr_data[0]
            msg = email.message_from_bytes(raw_hdr if isinstance(raw_hdr, bytes) else raw_hdr.encode())

            emails.append({
                "uid": uid.decode() if isinstance(uid, bytes) else str(uid),
                "message_id": (msg.get("Message-ID") or "").strip(),
                "from": _decode_str(msg.get("From", "")),
                "to": _decode_str(msg.get("To", "")),
                "subject": _decode_str(msg.get("Subject", "(No Subject)")),
                "date": msg.get("Date", ""),
                "seen": seen,
                "folder": folder,
            })
        except Exception:
            continue

    conn.logout()
    return emails


async def fetch_messages(host, port, username, password, folder="INBOX", limit=50) -> List[Dict[str, Any]]:
    return await asyncio.to_thread(_fetch_messages, host, port, username, password, folder, limit)


# ─── Single message body ──────────────────────────────────────────────────────

def _fetch_body(host, port, username, password, uid, folder="INBOX") -> Dict[str, Any]:
    conn = _connect(host, port, username, password)
    conn.select(folder)

    _, data = conn.fetch(uid.encode(), "(RFC822)")
    if not data or not data[0]:
        conn.logout()
        return {}

    raw = data[0][1]
    msg = email.message_from_bytes(raw if isinstance(raw, bytes) else raw.encode())
    conn.store(uid.encode(), "+FLAGS", "\\Seen")
    conn.logout()

    body_text, body_html = "", ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if "attachment" in cd:
                continue
            charset = part.get_content_charset() or "utf-8"
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            decoded = payload.decode(charset, errors="replace")
            if ct == "text/plain" and not body_text:
                body_text = decoded
            elif ct == "text/html" and not body_html:
                body_html = decoded
    else:
        charset = msg.get_content_charset() or "utf-8"
        payload = msg.get_payload(decode=True)
        if payload:
            decoded = payload.decode(charset, errors="replace")
            if msg.get_content_type() == "text/html":
                body_html = decoded
            else:
                body_text = decoded

    return {
        "uid": uid,
        "from": _decode_str(msg.get("From", "")),
        "to": _decode_str(msg.get("To", "")),
        "subject": _decode_str(msg.get("Subject", "")),
        "date": msg.get("Date", ""),
        "body_text": body_text[:50000],
        "body_html": body_html[:100000],
    }


async def fetch_body(host, port, username, password, uid, folder="INBOX") -> Dict[str, Any]:
    return await asyncio.to_thread(_fetch_body, host, port, username, password, uid, folder)


# ─── Subscription scanning ────────────────────────────────────────────────────

def _scan_subscriptions(host, port, username, password, limit=300) -> List[Dict[str, Any]]:
    conn = _connect(host, port, username, password)
    conn.select("INBOX", readonly=True)

    _, data = conn.search(None, "ALL")
    uids = list(reversed(data[0].split()))[:limit]

    senders: Dict[str, Dict[str, Any]] = {}

    for uid in uids:
        try:
            _, hdr_data = conn.fetch(uid, "(BODY.PEEK[HEADER.FIELDS (FROM LIST-UNSUBSCRIBE DATE)])")
            if not hdr_data or not hdr_data[0]:
                continue
            raw_hdr = hdr_data[0][1] if isinstance(hdr_data[0], tuple) else hdr_data[0]
            msg = email.message_from_bytes(raw_hdr if isinstance(raw_hdr, bytes) else raw_hdr.encode())

            unsub = msg.get("List-Unsubscribe", "")
            if not unsub:
                continue

            from_raw = _decode_str(msg.get("From", ""))
            email_match = re.search(r'[\w.+\-]+@[\w.\-]+\.\w+', from_raw)
            sender_email = email_match.group(0).lower() if email_match else from_raw
            name_match = re.match(r'^"?([^<"]+)"?\s*<', from_raw)
            sender_name = name_match.group(1).strip() if name_match else sender_email

            url_match = re.search(r'<(https?://[^>]+)>', unsub)
            unsub_url = url_match.group(1) if url_match else ""

            date_str = msg.get("Date", "")

            if sender_email not in senders:
                senders[sender_email] = {
                    "id": sender_email,
                    "sender_name": sender_name,
                    "sender_email": sender_email,
                    "count": 0,
                    "last_date": date_str,
                    "unsubscribe_url": unsub_url,
                }
            senders[sender_email]["count"] += 1
            if date_str:
                senders[sender_email]["last_date"] = date_str
        except Exception:
            continue

    conn.logout()
    return sorted(senders.values(), key=lambda x: x["count"], reverse=True)


async def scan_subscriptions(host, port, username, password, limit=300) -> List[Dict[str, Any]]:
    return await asyncio.to_thread(_scan_subscriptions, host, port, username, password, limit)

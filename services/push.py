"""
Web Push notification service using the VAPID protocol.
Generates VAPID keys on first run and stores them in settings.
"""
import json
import base64
import os
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

import httpx

# VAPID key generation uses the cryptography library (added to requirements)
try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PublicFormat, PrivateFormat, NoEncryption
    )
    _CRYPTO_OK = True
except ImportError:
    _CRYPTO_OK = False


def generate_vapid_keys() -> Dict[str, str]:
    """Generate a new VAPID key pair. Returns base64url-encoded public/private keys."""
    if not _CRYPTO_OK:
        raise RuntimeError("cryptography package not installed")
    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()

    private_bytes = private_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())
    public_bytes = public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)

    return {
        "public_key": base64.urlsafe_b64encode(public_bytes).rstrip(b"=").decode(),
        "private_key": base64.urlsafe_b64encode(private_bytes).rstrip(b"=").decode(),
    }


async def send_push_notification(
    subscription: Dict[str, Any],
    title: str,
    body: str,
    icon: str = "/static/icon.png",
    tag: str = "",
    vapid_private_key: Optional[str] = None,
    vapid_public_key: Optional[str] = None,
    vapid_subject: str = "mailto:admin@localhost",
) -> bool:
    """
    Send a Web Push notification to a subscription endpoint.
    Falls back to a basic POST if py-vapid/pywebpush is not available.
    """
    if not subscription or not subscription.get("endpoint"):
        return False

    payload = json.dumps({
        "title": title,
        "body": body,
        "icon": icon,
        "tag": tag or title,
        "timestamp": int(datetime.utcnow().timestamp() * 1000),
    })

    try:
        from pywebpush import webpush, WebPushException
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=vapid_private_key,
            vapid_claims={
                "sub": vapid_subject,
                "exp": int((datetime.utcnow() + timedelta(hours=12)).timestamp()),
            },
        )
        return True
    except ImportError:
        pass
    except Exception:
        return False

    # Fallback: simple POST (works for some basic push servers)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                subscription["endpoint"],
                content=payload,
                headers={"Content-Type": "application/json"},
            )
            return r.status_code < 300
    except Exception:
        return False

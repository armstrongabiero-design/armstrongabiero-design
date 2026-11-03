"""Login one-time codes for Group Fleet Managers: hashed at rest, limited attempts and sends."""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from auth_service import SECRET_KEY

logger = logging.getLogger(__name__)

OTP_TTL = timedelta(minutes=5)
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN = timedelta(seconds=60)
OTP_SEND_WINDOW = timedelta(minutes=15)
OTP_MAX_SENDS_PER_WINDOW = 5


class OtpSendLimitExceeded(Exception):
    """Too many codes were requested for this account in the current window."""


def _hash_code(email: str, code: str) -> str:
    return hmac.new(SECRET_KEY.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _parse(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


async def issue_otp(db, email: str) -> Optional[str]:
    """Create a code and return it, or None if a recent code is still usable.

    Attempts reset with each new code, so the send limit is what caps total guesses.
    """
    now = datetime.now(timezone.utc)
    record = await db.otp_codes.find_one({"email": email}, {"_id": 0}) or {}

    window_start = _parse(record.get("window_start"))
    send_count = int(record.get("send_count", 0))
    if not window_start or now - window_start >= OTP_SEND_WINDOW:
        window_start, send_count = now, 0
    if send_count >= OTP_MAX_SENDS_PER_WINDOW:
        logger.warning("OTP send limit reached for %s", email)
        raise OtpSendLimitExceeded()

    created_at = _parse(record.get("created_at"))
    expires_at = _parse(record.get("expires_at"))
    has_usable_code = (
        record.get("otp_hash")
        and int(record.get("attempts", 0)) < OTP_MAX_ATTEMPTS
        and expires_at and now < expires_at
    )
    if has_usable_code and created_at and now - created_at < OTP_RESEND_COOLDOWN:
        return None

    code = f"{secrets.randbelow(1_000_000):06d}"
    await db.otp_codes.update_one(
        {"email": email},
        {
            "$set": {
                "email": email,
                "otp_hash": _hash_code(email, code),
                "attempts": 0,
                "expires_at": (now + OTP_TTL).isoformat(),
                "created_at": now.isoformat(),
                "window_start": window_start.isoformat(),
                "send_count": send_count + 1,
            },
            # Codes stored before hashing was added must stop working.
            "$unset": {"otp": ""},
        },
        upsert=True,
    )
    return code


async def verify_otp_code(db, email: str, code: str) -> bool:
    """Check a code, spending one attempt. A correct code works only once."""
    # The record stays after failures so that its send window keeps counting.
    record = await db.otp_codes.find_one_and_update(
        {"email": email, "attempts": {"$lt": OTP_MAX_ATTEMPTS}},
        {"$inc": {"attempts": 1}},
    )
    if not record or not record.get("otp_hash"):
        return False
    expires_at = _parse(record.get("expires_at"))
    if not expires_at or datetime.now(timezone.utc) >= expires_at:
        return False
    if not hmac.compare_digest(record["otp_hash"], _hash_code(email, str(code))):
        if int(record.get("attempts", 0)) + 1 >= OTP_MAX_ATTEMPTS:
            logger.warning("OTP attempts exhausted for %s", email)
        return False
    deleted = await db.otp_codes.delete_one({"email": email})
    return deleted.deleted_count == 1

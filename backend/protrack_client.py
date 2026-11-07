"""ProTrack365 GPS API client. Read-only, with one access token shared by every API worker.

ProTrack cancels the previous token as soon as a new one is issued, so workers must not each
sign in for themselves. The token lives in MongoDB, and a short lease lets one worker renew it.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from typing import Any, Dict, Optional

import requests
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.protrack365.com"
REQUEST_TIMEOUT_SECONDS = 15
# Tokens last 2 hours. ProTrack recommends renewing every 90 minutes.
TOKEN_MAX_AGE_SECONDS = 90 * 60
TOKEN_LEASE_SECONDS = 20
TOKEN_DOC_ID = "protrack"

# The only calls this client may make. Commands (stop engine, unlock doors), geofence changes
# and account changes are deliberately absent: a leaked token must not be able to reach them.
ALLOWED_PATHS = frozenset({"/api/track", "/api/device/list", "/api/playback"})

TOKEN_ERRORS = frozenset({10010, 10011, 10012, 10002, 10003})
CREDENTIAL_ERRORS = frozenset({20001, 10016})
RATE_LIMITED = 10009

ERROR_MESSAGES = {
    10000: "ProTrack system error",
    10004: "ProTrack rejected a parameter",
    10007: "ProTrack permission denied",
    10009: "ProTrack is limiting requests",
    10013: "Tracker is not on this ProTrack account",
    10014: "Server clock is out of sync with ProTrack",
    10016: "ProTrack account is blocked",
    20001: "ProTrack account or password is wrong",
    20005: "Tracker not found in ProTrack",
    20023: "No data for this period",
    20046: "Tracker subscription has expired",
    20089: "Tracker is blocked",
}


class ProTrackError(Exception):
    def __init__(self, code: int, message: str = ""):
        self.code = code
        super().__init__(message or ERROR_MESSAGES.get(code, f"ProTrack error {code}"))


class ProTrackNotConfigured(ProTrackError):
    def __init__(self):
        super().__init__(-1, "GPS tracking is not configured")


def make_signature(password_md5: str, unix_time: int) -> str:
    """ProTrack's sign-in signature: md5(md5(password) + time), lower-case hex."""
    # ProTrack mandates md5; it is their protocol, not our password storage.
    return hashlib.md5(f"{password_md5.lower()}{unix_time}".encode("utf-8"), usedforsecurity=False).hexdigest()


def _config() -> Dict[str, str]:
    return {
        "base_url": os.environ.get("PROTRACK_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
        "account": os.environ.get("PROTRACK_ACCOUNT", "").strip(),
        "password_md5": os.environ.get("PROTRACK_PASSWORD_MD5", "").strip().lower(),
    }


def is_configured() -> bool:
    cfg = _config()
    return bool(cfg["account"] and cfg["password_md5"])


def _http_get(url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Blocking GET. Replaced in tests. The URL carries the token, so it is never logged."""
    response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json()


async def _send(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    url = _config()["base_url"] + path
    try:
        body = await asyncio.wait_for(
            asyncio.to_thread(_http_get, url, params), REQUEST_TIMEOUT_SECONDS + 5
        )
    except (requests.RequestException, asyncio.TimeoutError, ValueError) as exc:
        # The exception text can contain the URL and so the token: log the type only.
        raise ProTrackError(-2, f"Could not reach ProTrack ({type(exc).__name__})") from None
    if not isinstance(body, dict):
        raise ProTrackError(-3, "Unexpected reply from ProTrack")
    code = body.get("code", 0)
    if code != 0:
        raise ProTrackError(int(code))
    return body


async def acquire_lease(db, name: str, seconds: float) -> bool:
    now = time.time()
    try:
        await db.job_leases.insert_one({"_id": name, "until": now + seconds})
        return True
    except DuplicateKeyError:
        pass
    taken = await db.job_leases.find_one_and_update(
        {"_id": name, "until": {"$lt": now}}, {"$set": {"until": now + seconds}}
    )
    return taken is not None


async def release_lease(db, name: str) -> None:
    await db.job_leases.update_one({"_id": name}, {"$set": {"until": 0}})



def _usable(doc: Optional[Dict[str, Any]], stale_generation: Optional[int]) -> bool:
    if not doc or not doc.get("access_token"):
        return False
    if time.time() - doc.get("obtained_at", 0) > TOKEN_MAX_AGE_SECONDS:
        return False
    return stale_generation is None or doc.get("generation", 0) > stale_generation


async def get_token(db, stale_generation: Optional[int] = None) -> Dict[str, Any]:
    """Return {access_token, generation}. Pass the generation that just failed to force renewal."""
    if not is_configured():
        raise ProTrackNotConfigured()
    doc = await db.integration_tokens.find_one({"_id": TOKEN_DOC_ID})
    if _usable(doc, stale_generation):
        return doc

    deadline = time.monotonic() + TOKEN_LEASE_SECONDS + 5
    while time.monotonic() < deadline:
        if await acquire_lease(db, "protrack_token", TOKEN_LEASE_SECONDS):
            try:
                doc = await db.integration_tokens.find_one({"_id": TOKEN_DOC_ID})
                if _usable(doc, stale_generation):
                    return doc  # another worker renewed it while we waited
                cfg = _config()
                now = int(time.time())
                body = await _send(
                    "/api/authorization",
                    {"time": now, "account": cfg["account"], "signature": make_signature(cfg["password_md5"], now)},
                )
                token = (body.get("record") or {}).get("access_token")
                if not token:
                    raise ProTrackError(-3, "ProTrack sign-in returned no token")
                fresh = {
                    "access_token": token,
                    "generation": (doc or {}).get("generation", 0) + 1,
                    "obtained_at": time.time(),
                }
                await db.integration_tokens.update_one({"_id": TOKEN_DOC_ID}, {"$set": fresh}, upsert=True)
                logger.info("Signed in to ProTrack (token generation %s)", fresh["generation"])
                return fresh
            finally:
                await release_lease(db, "protrack_token")
        await asyncio.sleep(1)
        doc = await db.integration_tokens.find_one({"_id": TOKEN_DOC_ID})
        if _usable(doc, stale_generation):
            return doc
    raise ProTrackError(-4, "Timed out waiting for a ProTrack sign-in")


async def call(db, path: str, **params: Any) -> Dict[str, Any]:
    """Call an allowed read-only ProTrack path, renewing the token once if ProTrack rejects it."""
    if path not in ALLOWED_PATHS:
        raise ValueError(f"ProTrack path not allowed: {path}")
    token = await get_token(db)
    try:
        return await _send(path, {**params, "access_token": token["access_token"]})
    except ProTrackError as exc:
        if exc.code not in TOKEN_ERRORS:
            raise
        logger.warning("ProTrack token rejected (code %s); signing in again", exc.code)
    token = await get_token(db, stale_generation=token.get("generation", 0))
    return await _send(path, {**params, "access_token": token["access_token"]})

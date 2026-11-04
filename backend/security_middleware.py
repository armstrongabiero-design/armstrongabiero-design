"""API authentication middleware: require Bearer JWT for /api except allowlisted public routes."""
from __future__ import annotations

import logging
import os
from typing import Optional

from jwt import PyJWTError as JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from audit_service import write_audit_log
from auth_service import decode_token_raw, tokens_match
from database import db

# (method, path) exact match after normalizing trailing slash on path
_PUBLIC_EXACT = frozenset(
    {
        ("GET", "/api/countries/all-list"),
        ("POST", "/api/auth/login"),
        ("POST", "/api/auth/register"),
        ("POST", "/api/auth/bootstrap"),
        ("POST", "/api/auth/forgot-password"),
        ("POST", "/api/auth/reset-password"),
        ("POST", "/api/auth/accept-invite"),
        ("POST", "/api/auth/send-otp"),
        ("POST", "/api/auth/verify-otp"),
    }
)

_PUBLIC_PREFIXES = (
    ("GET", "/api/auth/verify-reset-token/"),
    ("GET", "/api/auth/verify-invite/"),
)


# Routes a scheduled job may call with X-Reminder-Token instead of a user login.
_CRON_ROUTES = frozenset({
    ("POST", "/api/reminders/run"),
    ("POST", "/api/vehicles/availability/snapshot"),
})
_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

logger = logging.getLogger(__name__)


async def _audit_write(request: Request, response, payload: Optional[dict]) -> None:
    """Record one entry per successful write. A failure here must never affect the request."""
    if request.method not in _WRITE_METHODS or not 200 <= response.status_code < 300:
        return
    try:
        route = request.scope.get("route")
        params = request.scope.get("path_params") or {}
        await write_audit_log(
            action="api_write",
            entity_type=getattr(route, "path", request.url.path),
            entity_id=",".join(str(v) for k, v in params.items() if "token" not in k) or "-",
            actor_id=(payload or {}).get("sub") or "cron",
            actor_role=(payload or {}).get("role") or "system",
            actor_email=(payload or {}).get("email"),
            details={
                "method": request.method,
                "status": response.status_code,
                "ip": request.client.host if request.client else None,
            },
        )
    except Exception:
        logger.exception("Could not write audit entry for %s %s", request.method, request.url.path)


def _normalize_path(path: str) -> str:
    if len(path) > 1 and path.endswith("/"):
        return path[:-1]
    return path


def is_public_api_route(method: str, path: str) -> bool:
    p = _normalize_path(path)
    if (method, p) in _PUBLIC_EXACT:
        return True
    for m, prefix in _PUBLIC_PREFIXES:
        if method == m and path.startswith(prefix):
            return True
    return False


class JWTAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path
        if not path.startswith("/api"):
            return await call_next(request)
        if is_public_api_route(request.method, path):
            return await call_next(request)

        # Scheduled jobs may authenticate via a shared token
        if (request.method, _normalize_path(path)) in _CRON_ROUTES:
            cron_token = os.environ.get("REMINDER_CRON_TOKEN", "").strip()
            header_token = request.headers.get("X-Reminder-Token", "")
            if tokens_match(cron_token, header_token):
                request.state.jwt_payload = None
                response = await call_next(request)
                await _audit_write(request, response, None)
                return response

        auth = request.headers.get("Authorization")
        if not auth or not auth.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Not authenticated"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        token = auth[7:].strip()
        if not token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Not authenticated"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            payload = decode_token_raw(token)
        except JWTError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid authentication token"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = payload.get("sub")
        if user_id is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid authentication token"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        user = await db.users.find_one(
            {"id": user_id},
            {
                "_id": 0,
                "token_version": 1,
                "is_active": 1,
                "is_approved": 1,
                "role": 1,
                "email": 1,
                "country": 1,
                "full_name": 1,
                "driver_id": 1,
            },
        )
        if not user:
            return JSONResponse(
                status_code=401,
                content={"detail": "User not found"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not user.get("is_active", True):
            return JSONResponse(
                status_code=403,
                content={"detail": "Account is deactivated"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        db_tv = int(user.get("token_version", 0))
        claim_tv = payload.get("tv")
        if claim_tv is None:
            claim_tv = 0
        else:
            try:
                claim_tv = int(claim_tv)
            except (TypeError, ValueError):
                claim_tv = -1
        if claim_tv != db_tv:
            return JSONResponse(
                status_code=401,
                content={"detail": "Session expired or invalidated. Please sign in again."},
                headers={"WWW-Authenticate": "Bearer"},
            )
        if user.get("role") != "GROUP_FLEET_MANAGER" and not user.get("is_approved", False):
            return JSONResponse(
                status_code=403,
                content={"detail": "Account pending approval by a fleet manager"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        # The database is authoritative: role and country changes apply on the next request.
        request.state.jwt_payload = {
            **payload,
            "role": user.get("role"),
            "email": user.get("email"),
            "country": user.get("country"),
            "full_name": user.get("full_name"),
            "driver_id": user.get("driver_id"),
        }
        response = await call_next(request)
        await _audit_write(request, response, request.state.jwt_payload)
        return response

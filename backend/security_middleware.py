"""API authentication middleware: require Bearer JWT for /api except allowlisted public routes."""
from __future__ import annotations

from jose import JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from auth_service import decode_token_raw
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
        ("POST", "/api/auth/send-otp"),
        ("POST", "/api/auth/verify-otp"),
    }
)

_PUBLIC_PREFIXES = (
    ("GET", "/api/auth/verify-reset-token/"),
)


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
            {"_id": 0, "token_version": 1, "is_active": 1},
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
        request.state.jwt_payload = payload
        return await call_next(request)

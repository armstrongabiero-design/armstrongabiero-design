"""FastAPI dependencies: current user from JWT (middleware) and DB-validated user for sensitive actions."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from database import db


async def get_current_user(request: Request) -> dict:
    payload = getattr(request.state, "jwt_payload", None)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    return {
        "id": user_id,
        "email": payload.get("email"),
        "role": payload.get("role"),
        "country": payload.get("country"),
        "full_name": payload.get("full_name"),
    }


async def get_current_user_validated(
    current: dict = Depends(get_current_user),
) -> dict:
    """Re-load user from DB for role / approval / active checks (sensitive operations)."""
    user = await db.users.find_one({"id": current["id"]}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
    if user.get("role") != "GROUP_FLEET_MANAGER" and not user.get("is_approved", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account pending approval by a fleet manager",
        )
    return {
        "id": user["id"],
        "email": user["email"],
        "role": user["role"],
        "country": user.get("country"),
        "full_name": user.get("full_name"),
    }


def require_group_manager():
    async def _dep(user: dict = Depends(get_current_user_validated)) -> dict:
        if user["role"] != "GROUP_FLEET_MANAGER":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _dep


def require_manager():
    async def _dep(user: dict = Depends(get_current_user_validated)) -> dict:
        if user["role"] not in ("GROUP_FLEET_MANAGER", "FLEET_MANAGER"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _dep


def require_role(allowed_roles: list):
    async def _dep(user: dict = Depends(get_current_user_validated)) -> dict:
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _dep


def require_fleet_staff():
    return require_role(["GROUP_FLEET_MANAGER", "FLEET_MANAGER", "FLEET_OFFICER"])


def require_any_authenticated():
    return require_role(
        ["GROUP_FLEET_MANAGER", "FLEET_MANAGER", "FLEET_OFFICER", "DRIVER", "USER"]
    )

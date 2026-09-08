"""Audit logging and delete-permission rules for fleet operations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
import uuid

from database import db

# Hard delete: Group Fleet Manager + Fleet Manager only.
# Fleet Officers may edit but cannot delete.
MANAGER_DELETE_ROLES = frozenset({"GROUP_FLEET_MANAGER", "FLEET_MANAGER"})


async def write_audit_log(
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    actor_id: str,
    actor_role: str,
    actor_email: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    doc = {
        "id": str(uuid.uuid4()),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "actor_email": actor_email,
        "details": details or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_logs.insert_one(doc)


def can_hard_delete(user: Dict[str, Any], entity_type: str) -> bool:
    role = user.get("role") or ""
    return role in MANAGER_DELETE_ROLES


def assert_can_hard_delete(user: Dict[str, Any], entity_type: str) -> None:
    from fastapi import HTTPException

    if not can_hard_delete(user, entity_type):
        raise HTTPException(
            status_code=403,
            detail=f"You do not have permission to delete this {entity_type.replace('_', ' ')}",
        )

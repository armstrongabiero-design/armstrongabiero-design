"""Audit logging and delete-permission rules for fleet operations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set
import uuid

from database import db

# Hard delete: Fleet Manager + Group Fleet Manager for most entities.
# Fleet Officer: limited deletes (e.g. logbook) — not vehicles/assets.
MANAGER_DELETE_ROLES = frozenset({"GROUP_FLEET_MANAGER", "FLEET_MANAGER"})

# entity_type -> roles allowed to hard-delete (subset for officers)
OFFICER_DELETE_ENTITIES = frozenset(
    {
        "driver_logbook",
        "logbook_entry",
        "maintenance_request",
        "pretrip_checklist",
    }
)

VEHICLE_PROTECTED_ENTITIES = frozenset(
    {
        "vehicle",
        "vehicles",
        "asset",
        "assets",
        "driver",
        "drivers",
        "vendor",
        "vendors",
        "tire",
        "tires",
    }
)


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
    normalized = entity_type.lower().replace("-", "_")

    if role in MANAGER_DELETE_ROLES:
        return True

    if role == "FLEET_OFFICER":
        if normalized in VEHICLE_PROTECTED_ENTITIES:
            return False
        return normalized in OFFICER_DELETE_ENTITIES

    return False


def assert_can_hard_delete(user: Dict[str, Any], entity_type: str) -> None:
    from fastapi import HTTPException

    if not can_hard_delete(user, entity_type):
        raise HTTPException(
            status_code=403,
            detail=f"You do not have permission to delete this {entity_type.replace('_', ' ')}",
        )

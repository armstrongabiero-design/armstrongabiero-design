"""One-time migration: legacy maintenance types → Predictive / Corrective / Routine."""
from __future__ import annotations

from database import db

_TYPE_MAP = {
    "SCHEDULED": "ROUTINE",
    "UNSCHEDULED": "CORRECTIVE",
    "PREDICTIVE": "PREDICTIVE",
}


async def migrate_maintenance_types() -> int:
    """Remap legacy maintenance_type values. Returns number of documents updated."""
    updated = 0
    for old, new in _TYPE_MAP.items():
        if old == new:
            continue
        result = await db.maintenance_records.update_many(
            {"maintenance_type": old},
            {"$set": {"maintenance_type": new}},
        )
        updated += result.modified_count
    return updated

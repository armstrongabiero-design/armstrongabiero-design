"""Clear expiry dates on Vehicle Registration Certificates (VRC)."""
from __future__ import annotations

from database import db


async def clear_vrc_expiry_dates() -> int:
    """Unset expiry_date on all VEHICLE_REGISTRATION documents. Returns modified count."""
    result = await db.documents.update_many(
        {
            "document_type": "VEHICLE_REGISTRATION",
            "expiry_date": {"$ne": None},
        },
        {"$set": {"expiry_date": None}},
    )
    return int(result.modified_count or 0)

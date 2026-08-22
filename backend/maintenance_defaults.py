"""Configurable maintenance interval defaults (months / km)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dateutil.relativedelta import relativedelta

SETTINGS_DOC_ID = "maintenance_interval_defaults"
DEFAULT_MONTHS = 3
DEFAULT_KM = 7000


async def get_maintenance_defaults(db) -> Dict[str, Any]:
    doc = await db.system_settings.find_one({"id": SETTINGS_DOC_ID}, {"_id": 0})
    if doc:
        return {
            "interval_months": int(doc.get("interval_months", DEFAULT_MONTHS)),
            "interval_km": float(doc.get("interval_km", DEFAULT_KM)),
        }
    return {"interval_months": DEFAULT_MONTHS, "interval_km": DEFAULT_KM}


async def save_maintenance_defaults(db, interval_months: int, interval_km: float, updated_by: Optional[str] = None) -> Dict[str, Any]:
    payload = {
        "id": SETTINGS_DOC_ID,
        "interval_months": max(1, int(interval_months)),
        "interval_km": max(1, float(interval_km)),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": updated_by,
    }
    await db.system_settings.update_one({"id": SETTINGS_DOC_ID}, {"$set": payload}, upsert=True)
    return {"interval_months": payload["interval_months"], "interval_km": payload["interval_km"]}


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def apply_maintenance_defaults(data: Dict[str, Any], defaults: Dict[str, Any]) -> Dict[str, Any]:
    """Fill next_due_date and next_service_odometer when omitted on create."""
    out = dict(data)
    months = int(defaults.get("interval_months", DEFAULT_MONTHS))
    km = float(defaults.get("interval_km", DEFAULT_KM))

    if not out.get("next_due_date"):
        sched = _parse_dt(out.get("scheduled_date"))
        if sched:
            out["next_due_date"] = sched + relativedelta(months=months)

    if out.get("next_service_odometer") is None:
        odo = out.get("odometer_at_maintenance")
        if odo is not None:
            try:
                out["next_service_odometer"] = float(odo) + km
            except (TypeError, ValueError):
                pass
    return out

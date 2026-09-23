"""Dashboard alert thresholds and categorization helpers."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

SCHEDULED_ALERT_LEAD_DAYS = 30
MAINTENANCE_ODO_LEAD_KM = 1000

# Alert type -> category
_ALERT_CATEGORY_BY_TYPE = {
    "DOCUMENT_EXPIRY": "DOCUMENT",
    "DOCUMENT_RENEWAL": "DOCUMENT",
    "DOCUMENT_MISSING": "DOCUMENT",
    "MAINTENANCE_OVERDUE": "MAINTENANCE",
    "MAINTENANCE_DUE_SOON": "MAINTENANCE",
    "MAINTENANCE_ODOMETER_DUE": "MAINTENANCE",
    "MAINTENANCE_ODOMETER_OVERDUE": "MAINTENANCE",
    "MAINTENANCE_DUE": "OPERATIONS",  # pending requests summary
    "FUEL_ANOMALY": "OPERATIONS",
    "SPEEDING": "OPERATIONS",
    "LOW_STOCK": "OPERATIONS",
    "TIRE_REPLACEMENT_DUE": "INSPECTION",
    "TIRE_ROTATION_DUE": "INSPECTION",
}


def alert_category(alert_type: Optional[str]) -> str:
    if not alert_type:
        return "OPERATIONS"
    if alert_type in _ALERT_CATEGORY_BY_TYPE:
        return _ALERT_CATEGORY_BY_TYPE[alert_type]
    if alert_type.startswith("DOCUMENT"):
        return "DOCUMENT"
    if alert_type.startswith("MAINTENANCE"):
        return "MAINTENANCE"
    if alert_type.startswith("TIRE") or "INSPECT" in alert_type:
        return "INSPECTION"
    return "OPERATIONS"


def apply_alert_categories(alerts: List[Dict[str, Any]]) -> Dict[str, int]:
    """Mutate alerts to include category; return category counts."""
    counts: Counter = Counter()
    for alert in alerts:
        cat = alert.get("category") or alert_category(alert.get("type"))
        alert["category"] = cat
        counts[cat] += 1
    return dict(counts)


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def record_sort_key(record: Dict[str, Any]) -> float:
    for field in ("completed_date", "scheduled_date", "created_at"):
        dt = _parse_dt(record.get(field))
        if dt:
            return dt.timestamp()
    return 0.0


def latest_maintenance_by_vehicle(records: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Return map vehicle_id -> newest maintenance record."""
    best: Dict[str, Dict[str, Any]] = {}
    best_key: Dict[str, float] = {}
    for record in records:
        vid = record.get("vehicle_id")
        if not vid:
            continue
        key = record_sort_key(record)
        if vid not in best or key > best_key[vid]:
            best[vid] = record
            best_key[vid] = key
    return best


def format_due_date(value: Any) -> str:
    dt = _parse_dt(value)
    if not dt:
        return "—"
    return dt.strftime("%Y-%m-%d")


def build_maintenance_alerts_for_vehicle(
    *,
    vehicle: Dict[str, Any],
    record: Dict[str, Any],
    now: datetime,
    lead_days: int = SCHEDULED_ALERT_LEAD_DAYS,
    odo_lead_km: float = MAINTENANCE_ODO_LEAD_KM,
) -> List[Dict[str, Any]]:
    """Independent date and odometer alerts from the latest record."""
    out: List[Dict[str, Any]] = []
    reg = vehicle.get("registration_number") or "Unknown"
    desc = (record.get("description") or "DUE FOR SERVICING").strip() or "DUE FOR SERVICING"
    title_prefix = f"[DUE FOR SERVICING] {desc}"
    base = {
        "category": "MAINTENANCE",
        "entity_type": "maintenance_record",
        "entity_id": record.get("id"),
        "link_entity_id": vehicle.get("id"),
        "link_entity_type": "VEHICLE",
        "country": record.get("country") or vehicle.get("country"),
        "registration_number": reg,
        "description": desc,
    }

    next_due = _parse_dt(record.get("next_due_date"))
    if next_due:
        days_until = (next_due - now).days
        due_str = format_due_date(next_due)
        odo_at = record.get("odometer_at_maintenance")
        odo_part = ""
        if odo_at is not None:
            try:
                odo_part = f" ({float(odo_at):.0f}km)" if float(odo_at) == int(float(odo_at)) else f" ({float(odo_at)}km)"
            except (TypeError, ValueError):
                odo_part = ""
        date_message = f"{due_str}{odo_part}"
        if days_until < 0:
            out.append({
                **base,
                "type": "MAINTENANCE_OVERDUE",
                "severity": "CRITICAL",
                "title": title_prefix,
                "message": f"{date_message} — overdue by {abs(days_until)} day(s) · {reg}",
                "days_until_due": days_until,
                "next_due_date": due_str,
            })
        elif days_until <= lead_days:
            out.append({
                **base,
                "type": "MAINTENANCE_DUE_SOON",
                "severity": "WARNING",
                "title": title_prefix,
                "message": f"{date_message} — due in {days_until} day(s) · {reg}",
                "days_until_due": days_until,
                "next_due_date": due_str,
            })

    target_odo = record.get("next_service_odometer")
    if target_odo is not None:
        try:
            target = float(target_odo)
        except (TypeError, ValueError):
            target = None
        if target is not None:
            current = float(vehicle.get("odometer_reading") or 0)
            remaining = target - current
            if remaining <= 0:
                out.append({
                    **base,
                    "type": "MAINTENANCE_ODOMETER_OVERDUE",
                    "severity": "CRITICAL",
                    "title": title_prefix,
                    "message": f"Odometer {current:,.0f}km ≥ next service {target:,.0f}km · {reg}",
                    "km_remaining": remaining,
                    "next_service_odometer": target,
                    "current_odometer": current,
                })
            elif remaining <= odo_lead_km:
                out.append({
                    **base,
                    "type": "MAINTENANCE_ODOMETER_DUE",
                    "severity": "WARNING",
                    "title": title_prefix,
                    "message": f"{remaining:,.0f} km remaining until {target:,.0f}km · {reg}",
                    "km_remaining": remaining,
                    "next_service_odometer": target,
                    "current_odometer": current,
                })

    return out

"""Vehicle availability counts, status updates, and daily snapshots."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta, date
from typing import Any, Dict, List, Optional, Tuple

from models.availability import (
    AVAILABILITY_REASON_LABELS,
    AvailabilityReason,
    VehicleAvailabilityEvent,
    VehicleAvailabilitySnapshot,
    VehicleAvailabilityUpdate,
)
from models.enums import VehicleStatus
from country_utils import normalize_country_code, country_filter_query


OPERATIONAL_STATUSES = (
    VehicleStatus.ACTIVE.value,
    VehicleStatus.INACTIVE.value,
    VehicleStatus.MAINTENANCE.value,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _today_utc() -> str:
    return _utcnow().date().isoformat()


def compute_counts(vehicles: List[dict]) -> Dict[str, Any]:
    operational = [
        v for v in vehicles
        if (v.get("status") or VehicleStatus.ACTIVE.value) in OPERATIONAL_STATUSES
    ]
    active = sum(1 for v in operational if v.get("status") == VehicleStatus.ACTIVE.value)
    inactive = sum(1 for v in operational if v.get("status") == VehicleStatus.INACTIVE.value)
    maintenance = sum(1 for v in operational if v.get("status") == VehicleStatus.MAINTENANCE.value)
    total = len(operational)
    available = active  # not-down; MAINTENANCE counts as unavailable
    pct = round((available / total) * 100, 1) if total else 0.0
    return {
        "total": total,
        "active": active,
        "inactive": inactive,
        "maintenance": maintenance,
        "unavailable": inactive + maintenance,
        "available": available,
        "availability_pct": pct,
    }


async def load_vehicles(db, country: Optional[str] = None) -> List[dict]:
    query = country_filter_query(country) if country else {}
    return await db.vehicles.find(query, {"_id": 0}).to_list(5000)


async def get_availability_summary(db, country: Optional[str] = None) -> Dict[str, Any]:
    vehicles = await load_vehicles(db, country)
    counts = compute_counts(vehicles)
    by_country: Dict[str, Dict[str, Any]] = {}
    for v in vehicles:
        code = normalize_country_code(v.get("country") or "") or "XX"
        by_country.setdefault(code, []).append(v)
    return {
        **counts,
        "country": normalize_country_code(country) if country else None,
        "by_country": {
            code: compute_counts(items) for code, items in sorted(by_country.items())
        },
        "reasons": [
            {"value": k, "label": v} for k, v in AVAILABILITY_REASON_LABELS.items()
        ],
    }


async def update_vehicle_availability(
    db,
    vehicle_id: str,
    payload: VehicleAvailabilityUpdate,
    actor: dict,
) -> dict:
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise ValueError("Vehicle not found")

    new_status = payload.status.value if hasattr(payload.status, "value") else str(payload.status)
    previous = vehicle.get("status")

    if new_status in (VehicleStatus.INACTIVE.value, VehicleStatus.MAINTENANCE.value):
        if not payload.reason:
            raise ValueError("A reason is required when setting Inactive or Maintenance status")
    reason_val = payload.reason.value if payload.reason else None
    notes = (payload.notes or "").strip() or None

    now = _utcnow()
    update_fields: Dict[str, Any] = {
        "status": new_status,
        "availability_reason": reason_val if new_status != VehicleStatus.ACTIVE.value else None,
        "availability_notes": notes if new_status != VehicleStatus.ACTIVE.value else None,
        "availability_changed_at": now.isoformat(),
        "availability_changed_by": actor.get("id"),
        "updated_at": now.isoformat(),
    }

    await db.vehicles.update_one({"id": vehicle_id}, {"$set": update_fields})

    event = VehicleAvailabilityEvent(
        vehicle_id=vehicle_id,
        country=normalize_country_code(vehicle.get("country")),
        previous_status=previous,
        new_status=new_status,
        reason=reason_val,
        notes=notes,
        changed_by=actor.get("id"),
        changed_by_email=actor.get("email"),
    )
    doc = event.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.vehicle_availability_events.insert_one(doc)

    updated = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    return updated


async def take_daily_snapshots(db) -> Dict[str, Any]:
    """Upsert today's fleet-wide and per-country availability snapshots (UTC date)."""
    snapshot_date = _today_utc()
    vehicles = await load_vehicles(db)
    overall = compute_counts(vehicles)

    async def upsert(country: Optional[str], counts: Dict[str, Any]):
        filt = {"snapshot_date": snapshot_date, "country": country}
        snap = VehicleAvailabilitySnapshot(
            snapshot_date=snapshot_date,
            country=country,
            total=counts["total"],
            active=counts["active"],
            inactive=counts["inactive"],
            maintenance=counts["maintenance"],
            available=counts["available"],
            availability_pct=counts["availability_pct"],
        )
        doc = snap.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.vehicle_availability_snapshots.update_one(
            filt,
            {"$set": doc},
            upsert=True,
        )

    await upsert(None, overall)

    by_country: Dict[str, List[dict]] = {}
    for v in vehicles:
        code = normalize_country_code(v.get("country") or "") or "XX"
        by_country.setdefault(code, []).append(v)
    for code, items in by_country.items():
        await upsert(code, compute_counts(items))

    return {"snapshot_date": snapshot_date, "countries": len(by_country), **overall}


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())  # Monday=0


async def get_weekly_series(db, country: Optional[str] = None, weeks: int = 12) -> List[dict]:
    today = _utcnow().date()
    start_monday = _monday_of(today) - timedelta(weeks=weeks - 1)
    start_str = start_monday.isoformat()

    query: Dict[str, Any] = {"snapshot_date": {"$gte": start_str}}
    if country:
        query["country"] = normalize_country_code(country)
    else:
        query["country"] = None

    snaps = await db.vehicle_availability_snapshots.find(query, {"_id": 0}).to_list(5000)
    by_date = {s["snapshot_date"]: s for s in snaps}

    series = []
    for i in range(weeks):
        week_start = start_monday + timedelta(weeks=i)
        week_end = week_start + timedelta(days=6)
        # Prefer Sunday snapshot, else latest in week
        chosen = None
        for offset in range(6, -1, -1):
            key = (week_start + timedelta(days=offset)).isoformat()
            if key in by_date:
                chosen = by_date[key]
                break
        series.append({
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "label": f"{week_start.strftime('%d %b')}–{week_end.strftime('%d %b')}",
            "availability_pct": chosen["availability_pct"] if chosen else None,
            "available": chosen["available"] if chosen else None,
            "total": chosen["total"] if chosen else None,
            "active": chosen["active"] if chosen else None,
            "inactive": chosen["inactive"] if chosen else None,
            "maintenance": chosen["maintenance"] if chosen else None,
        })
    return series


async def get_monthly_series(db, country: Optional[str] = None, months: int = 12) -> List[dict]:
    today = _utcnow().date()
    # First day of month, go back (months-1)
    year, month = today.year, today.month
    series_meta = []
    for i in range(months - 1, -1, -1):
        m = month - i
        y = year
        while m <= 0:
            m += 12
            y -= 1
        series_meta.append((y, m))

    first = date(series_meta[0][0], series_meta[0][1], 1)
    query: Dict[str, Any] = {"snapshot_date": {"$gte": first.isoformat()}}
    if country:
        query["country"] = normalize_country_code(country)
    else:
        query["country"] = None

    snaps = await db.vehicle_availability_snapshots.find(query, {"_id": 0}).to_list(5000)

    by_month: Dict[Tuple[int, int], dict] = {}
    for s in snaps:
        try:
            d = date.fromisoformat(s["snapshot_date"])
        except (TypeError, ValueError):
            continue
        key = (d.year, d.month)
        existing = by_month.get(key)
        if not existing or s["snapshot_date"] >= existing["snapshot_date"]:
            by_month[key] = s

    out = []
    for y, m in series_meta:
        chosen = by_month.get((y, m))
        out.append({
            "year": y,
            "month": m,
            "label": date(y, m, 1).strftime("%b %Y"),
            "availability_pct": chosen["availability_pct"] if chosen else None,
            "available": chosen["available"] if chosen else None,
            "total": chosen["total"] if chosen else None,
            "active": chosen["active"] if chosen else None,
            "inactive": chosen["inactive"] if chosen else None,
            "maintenance": chosen["maintenance"] if chosen else None,
        })
    return out


async def list_availability_events(
    db,
    country: Optional[str] = None,
    vehicle_id: Optional[str] = None,
    limit: int = 100,
) -> List[dict]:
    query: Dict[str, Any] = {}
    if vehicle_id:
        query["vehicle_id"] = vehicle_id
    if country:
        query.update(country_filter_query(country))
    return await db.vehicle_availability_events.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)

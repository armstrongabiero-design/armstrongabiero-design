"""Sync vehicle master records to operational vehicles collection."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
import uuid

from models.vehicle_master import VEHICLE_MASTER_COLUMNS

# Master field -> Vehicle field
MASTER_TO_VEHICLE = {
    "country": "country",
    "registration_number": "registration_number",
    "make": "make",
    "model": "model",
    "year_of_manufacture": "year",
    "chassis_vin": "vin",
    "acquisition_date": "acquisition_date",
}

# Vehicle core fields mirrored into master (not stored only in master_fields)
_CORE_MASTER_KEYS = {
    "registration_number",
    "make",
    "model",
    "year_of_manufacture",
    "chassis_vin",
    "acquisition_date",
    "country",
}

_MASTER_FIELD_KEYS = [key for key, _ in VEHICLE_MASTER_COLUMNS]


def _parse_acquisition_date(value: Any) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return text


def _acquisition_date_for_master(value: Any) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    text = str(value).strip()
    if not text:
        return None
    if "T" in text:
        return text.split("T", 1)[0]
    return text


def vehicle_update_from_master(master: Dict[str, Any]) -> Dict[str, Any]:
    """Build partial vehicle update dict from a master record."""
    updates: Dict[str, Any] = {}
    for master_key, vehicle_key in MASTER_TO_VEHICLE.items():
        val = master.get(master_key)
        if val is None or val == "":
            continue
        if vehicle_key == "acquisition_date":
            parsed = _parse_acquisition_date(val)
            if parsed:
                updates[vehicle_key] = parsed
        elif vehicle_key == "year":
            try:
                updates[vehicle_key] = int(val)
            except (TypeError, ValueError):
                pass
        else:
            updates[vehicle_key] = val

    # Persist full master attribute set on the operational vehicle for Vehicles UI
    master_fields: Dict[str, Any] = {}
    for key in _MASTER_FIELD_KEYS:
        if key in _CORE_MASTER_KEYS:
            continue
        val = master.get(key)
        if val is None or val == "":
            continue
        master_fields[key] = val
    if master_fields:
        updates["master_fields"] = master_fields

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    return updates


def master_payload_from_vehicle(vehicle: Dict[str, Any]) -> Dict[str, Any]:
    """Build vehicle_masters fields from an operational vehicle document."""
    mf = vehicle.get("master_fields") or {}
    payload: Dict[str, Any] = {
        "country": vehicle.get("country"),
        "linked_vehicle_id": vehicle.get("id"),
        "registration_number": vehicle.get("registration_number"),
        "make": vehicle.get("make"),
        "model": vehicle.get("model"),
        "year_of_manufacture": vehicle.get("year"),
        "chassis_vin": vehicle.get("vin"),
        "acquisition_date": _acquisition_date_for_master(vehicle.get("acquisition_date")),
    }
    for key in _MASTER_FIELD_KEYS:
        if key in _CORE_MASTER_KEYS:
            continue
        if key in mf and mf[key] is not None and mf[key] != "":
            payload[key] = mf[key]
    return payload


async def sync_master_to_vehicles(db, master: Dict[str, Any]) -> int:
    """Push master fields to linked vehicle and any vehicle with same registration/VIN."""
    updates = vehicle_update_from_master(master)
    if not updates:
        return 0

    touched = 0
    target_ids = set()
    if master.get("linked_vehicle_id"):
        target_ids.add(master["linked_vehicle_id"])

    reg = (master.get("registration_number") or "").strip().upper()
    vin = (master.get("chassis_vin") or "").strip().upper()
    if reg:
        for v in await db.vehicles.find(
            {"registration_number": {"$regex": f"^{reg}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        ).to_list(50):
            target_ids.add(v["id"])
    if vin:
        for v in await db.vehicles.find(
            {"vin": {"$regex": f"^{vin}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        ).to_list(50):
            target_ids.add(v["id"])

    for vid in target_ids:
        result = await db.vehicles.update_one({"id": vid}, {"$set": updates})
        if result.modified_count:
            touched += 1
    return touched


async def upsert_master_from_vehicle(db, vehicle: Dict[str, Any]) -> Optional[str]:
    """Create or update a vehicle_masters row from an operational vehicle."""
    payload = master_payload_from_vehicle(vehicle)
    if not payload.get("registration_number") and not payload.get("chassis_vin"):
        return None

    now = datetime.now(timezone.utc).isoformat()
    existing = None
    if vehicle.get("id"):
        existing = await db.vehicle_masters.find_one(
            {"linked_vehicle_id": vehicle["id"]}, {"_id": 0}
        )
    if not existing and payload.get("registration_number"):
        reg = payload["registration_number"].strip()
        existing = await db.vehicle_masters.find_one(
            {"registration_number": {"$regex": f"^{reg}$", "$options": "i"}},
            {"_id": 0},
        )

    if existing:
        update_data = {k: v for k, v in payload.items() if v is not None and v != ""}
        update_data["updated_at"] = now
        update_data["linked_vehicle_id"] = vehicle.get("id")
        await db.vehicle_masters.update_one({"id": existing["id"]}, {"$set": update_data})
        return existing["id"]

    record_id = str(uuid.uuid4())
    doc = {**payload, "id": record_id, "created_at": now, "updated_at": now}
    await db.vehicle_masters.insert_one(doc)
    return record_id

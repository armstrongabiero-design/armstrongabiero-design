"""Sync vehicle master records to operational vehicles collection."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

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
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    return updates


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
        for v in await db.vehicles.find({"registration_number": {"$regex": f"^{reg}$", "$options": "i"}}, {"_id": 0, "id": 1}).to_list(50):
            target_ids.add(v["id"])
    if vin:
        for v in await db.vehicles.find({"vin": {"$regex": f"^{vin}$", "$options": "i"}}, {"_id": 0, "id": 1}).to_list(50):
            target_ids.add(v["id"])

    for vid in target_ids:
        result = await db.vehicles.update_one({"id": vid}, {"$set": updates})
        if result.modified_count:
            touched += 1
    return touched

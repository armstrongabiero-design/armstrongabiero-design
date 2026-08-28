"""Shared helpers for reports, TCO, and dashboard fleet value."""
from __future__ import annotations

from typing import Any, Dict, List, Optional


async def vehicle_ids_for_country_filter(db, country_filter: Optional[Dict[str, Any]]) -> Optional[List[str]]:
    """Return vehicle ids for a country filter, or None when no country scope applies."""
    if not country_filter:
        return None
    vehicles = await db.vehicles.find(country_filter, {"_id": 0, "id": 1}).to_list(10000)
    return [v["id"] for v in vehicles]


def scoped_vehicle_query(base: Dict[str, Any], vehicle_ids: Optional[List[str]]) -> Dict[str, Any]:
    """Restrict a query to vehicles in scope; empty scope yields no matches."""
    if vehicle_ids is None:
        return base
    if not vehicle_ids:
        return {**base, "vehicle_id": "__none__"}
    return {**base, "vehicle_id": {"$in": vehicle_ids}}


def maintenance_on_or_after(start_date: str) -> Dict[str, Any]:
    """Maintenance records store scheduled_date (ISO string), not date."""
    return {"scheduled_date": {"$gte": start_date}}


async def compute_total_fleet_value_usd(db, country_filter: Optional[Dict[str, Any]] = None) -> float:
    """
    Fleet value (USD):
    - Uses Assets module current_value_usd when an asset exists for the vehicle.
    - Otherwise uses the vehicle acquisition_cost_usd from the Vehicles register.
    """
    country_filter = country_filter or {}
    vehicles = await db.vehicles.find(
        country_filter,
        {"_id": 0, "id": 1, "acquisition_cost_usd": 1},
    ).to_list(10000)
    if not vehicles:
        return 0.0

    vehicle_ids = [v["id"] for v in vehicles]
    assets = await db.assets.find(
        {"vehicle_id": {"$in": vehicle_ids}},
        {"_id": 0, "vehicle_id": 1, "current_value_usd": 1},
    ).to_list(10000)
    asset_values = {a["vehicle_id"]: float(a.get("current_value_usd") or 0) for a in assets}

    total = 0.0
    for vehicle in vehicles:
        vid = vehicle["id"]
        if vid in asset_values:
            total += asset_values[vid]
        else:
            total += float(vehicle.get("acquisition_cost_usd") or 0)
    return round(total, 2)

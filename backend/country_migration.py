"""One-time migration: legacy country enum strings → ISO alpha-2."""
from __future__ import annotations

from country_utils import LEGACY_ENUM_TO_ISO, NAME_TO_ISO, normalize_country_code
from database import db

# Collections with a top-level `country` field
_COUNTRY_FIELD_COLLECTIONS = [
    "vehicles",
    "drivers",
    "assets",
    "documents",
    "fuel_transactions",
    "expenditures",
    "inventory_items",
    "maintenance_records",
    "maintenance_requests",
    "fleet_managers",
    "vendors",
    "tires",
    "driver_logbook",
    "vehicle_locations",
    "safety_incidents",
    "pretrip_checklists",
    "countries",
    "users",
]


def _to_iso(value: object) -> str | None:
    if value is None:
        return None
    try:
        return normalize_country_code(value)
    except ValueError:
        raw = str(value).strip().upper()
        if raw in LEGACY_ENUM_TO_ISO:
            return LEGACY_ENUM_TO_ISO[raw]
        if raw in NAME_TO_ISO:
            return NAME_TO_ISO[raw]
        return None


async def migrate_countries_to_iso() -> int:
    """Rewrite legacy country values. Returns number of documents updated."""
    updated = 0
    for coll_name in _COUNTRY_FIELD_COLLECTIONS:
        collection = db[coll_name]
        async for doc in collection.find({"country": {"$exists": True}}):
            iso = _to_iso(doc.get("country"))
            if iso and iso != doc.get("country"):
                await collection.update_one({"id": doc["id"]}, {"$set": {"country": iso}})
                updated += 1
        # Country config collection uses `name` for legacy enum
        if coll_name == "countries":
            async for doc in collection.find({"name": {"$exists": True}}):
                iso = _to_iso(doc.get("name"))
                if iso and iso != doc.get("name"):
                    await collection.update_one({"id": doc["id"]}, {"$set": {"name": iso}})
                    updated += 1
    return updated

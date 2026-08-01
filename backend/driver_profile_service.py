"""Ensure approved DRIVER users have a linked fleet driver profile."""
from __future__ import annotations

import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from country_utils import normalize_country_code


def _split_name(full_name: Optional[str]) -> tuple:
    name = (full_name or "Driver").strip() or "Driver"
    parts = name.split(None, 1)
    first = parts[0]
    last = parts[1] if len(parts) > 1 else "—"
    return first, last


async def ensure_driver_profile_for_user(db, user: dict) -> Optional[dict]:
    """
    Create or link a drivers-collection profile for an approved DRIVER account.
    Uses user.id as the driver id when creating so historical checklists that
    stored user.id as driver_id resolve to a name on the Drivers page and history.
    """
    role = user.get("role")
    if hasattr(role, "value"):
        role = role.value
    if role != "DRIVER":
        return None
    if not user.get("is_approved", False):
        return None

    linked_id = user.get("driver_id")
    if linked_id:
        existing = await db.drivers.find_one({"id": linked_id}, {"_id": 0})
        if existing:
            return existing

    email = (user.get("email") or "").strip()
    if email:
        by_email = await db.drivers.find_one(
            {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
            {"_id": 0},
        )
        if by_email:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"driver_id": by_email["id"]}},
            )
            return by_email

    # Prefer user.id so pre-trip rows that used account id still match
    driver_id = linked_id or user["id"]
    existing = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if existing:
        if user.get("driver_id") != driver_id:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"driver_id": driver_id}},
            )
        return existing

    first, last = _split_name(user.get("full_name"))
    try:
        country = normalize_country_code(user.get("country") or "GH")
    except Exception:
        country = "GH"
    now = datetime.now(timezone.utc)
    doc: Dict[str, Any] = {
        "id": driver_id,
        "country": country,
        "first_name": first,
        "last_name": last,
        "license_number": f"PENDING-{str(driver_id)[:8].upper()}",
        "license_expiry": (now + timedelta(days=365)).isoformat(),
        "phone": (user.get("phone") or "—"),
        "email": user.get("email"),
        "safety_score": 100.0,
        "total_incidents": 0,
        "status": "ACTIVE",
        "user_id": user["id"],
        "profile_source": "auto_from_user",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.drivers.insert_one(doc)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"driver_id": driver_id}},
    )
    return doc


async def sync_approved_driver_profiles(db) -> int:
    """Backfill driver profiles for all approved DRIVER users. Returns created/linked count."""
    users = await db.users.find(
        {"role": "DRIVER", "is_approved": True},
        {"_id": 0},
    ).to_list(5000)
    touched = 0
    for user in users:
        before = user.get("driver_id")
        profile = await ensure_driver_profile_for_user(db, user)
        if profile and (not before or before != profile.get("id")):
            touched += 1
        elif profile and before is None:
            touched += 1
    return touched


async def resolve_driver_display_names(db, driver_ids: List[str]) -> Dict[str, str]:
    """Map driver_id → display name from drivers, then users fallback."""
    ids = [i for i in set(driver_ids) if i]
    if not ids:
        return {}
    names: Dict[str, str] = {}
    drivers = await db.drivers.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1}).to_list(len(ids))
    for d in drivers:
        names[d["id"]] = f"{d.get('first_name', '')} {d.get('last_name', '')}".strip() or "—"
    missing = [i for i in ids if i not in names]
    if missing:
        users = await db.users.find(
            {"$or": [{"id": {"$in": missing}}, {"driver_id": {"$in": missing}}]},
            {"_id": 0, "id": 1, "driver_id": 1, "full_name": 1},
        ).to_list(len(missing) * 2)
        for u in users:
            label = (u.get("full_name") or "").strip()
            if not label:
                continue
            if u.get("id") in missing:
                names[u["id"]] = label
            if u.get("driver_id") in missing:
                names[u["driver_id"]] = label
    return names

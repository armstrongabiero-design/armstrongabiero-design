"""Central authorization policy: who may touch which country and which driver's data.

Roles
  GROUP_FLEET_MANAGER  every country.
  FLEET_MANAGER, FLEET_OFFICER  their own country only.
  DRIVER, USER  their own driver records, plus basic vehicle details in their country.

Everything fails closed: a non-group user with no country assigned matches no data.
Identity and role come from the database on every request (see security_middleware).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from country_utils import country_filter_query, normalize_country_code
from database import db

GROUP_MANAGER_ROLE = "GROUP_FLEET_MANAGER"
STAFF_ROLES = frozenset({GROUP_MANAGER_ROLE, "FLEET_MANAGER", "FLEET_OFFICER"})

_NO_MATCH = "__out_of_scope__"
_OUT_OF_SCOPE_DETAIL = "This record is outside your access scope"


def is_group_manager(user: Dict[str, Any]) -> bool:
    return user.get("role") == GROUP_MANAGER_ROLE


def is_staff(user: Dict[str, Any]) -> bool:
    return user.get("role") in STAFF_ROLES


def driver_identities(user: Dict[str, Any]) -> List[str]:
    """IDs a user's driver records may be stored under (older records use the account id)."""
    return [i for i in (user.get("id"), user.get("driver_id")) if i]


def own_driver_filter(user: Dict[str, Any]) -> Dict[str, Any]:
    return {"driver_id": {"$in": driver_identities(user)}}


def _normalize(country: Any) -> Optional[str]:
    if not country:
        return None
    try:
        return normalize_country_code(getattr(country, "value", country))
    except ValueError:
        return None


def effective_country(user: Dict[str, Any], requested: Optional[str] = None) -> Optional[str]:
    """Country a request may use. None means "all countries" (group managers only)."""
    if is_group_manager(user):
        if not requested:
            return None
        code = _normalize(requested)
        if not code:
            raise HTTPException(status_code=400, detail="Invalid country")
        return code
    code = _normalize(user.get("country"))
    if not code:
        raise HTTPException(status_code=403, detail="Your account has no country assigned")
    return code


def country_query(user: Dict[str, Any], requested: Optional[str] = None) -> Dict[str, Any]:
    """Mongo filter for collections with a country field. Non-group users cannot widen it."""
    try:
        code = effective_country(user, requested)
    except HTTPException as exc:
        if exc.status_code == 403:
            return {"country": _NO_MATCH}
        raise
    return country_filter_query(code) if code else {}


async def vehicle_scope_query(user: Dict[str, Any], requested: Optional[str] = None) -> Dict[str, Any]:
    """Mongo filter for collections with no country field, scoped through vehicle_id."""
    query = country_query(user, requested)
    if not query:
        return {}
    vehicles = await db.vehicles.find(query, {"_id": 0, "id": 1}).to_list(10000)
    return {"vehicle_id": {"$in": [v["id"] for v in vehicles]}}


async def read_scope(user: Dict[str, Any], requested: Optional[str] = None) -> Dict[str, Any]:
    """Filter for driver-owned records: non-staff see their own, staff see their country."""
    if not is_staff(user):
        return own_driver_filter(user)
    return await vehicle_scope_query(user, requested)


def merge_scope(query: Dict[str, Any], scope: Dict[str, Any]) -> Dict[str, Any]:
    if not scope:
        return query
    return {"$and": [query, scope]} if query else scope


def assert_country(user: Dict[str, Any], country: Any) -> None:
    if is_group_manager(user):
        return
    allowed = _normalize(user.get("country"))
    if not allowed or _normalize(country) != allowed:
        raise HTTPException(status_code=403, detail=_OUT_OF_SCOPE_DETAIL)


def assert_own_driver(user: Dict[str, Any], driver_id: Optional[str]) -> None:
    if driver_id not in driver_identities(user):
        raise HTTPException(status_code=403, detail="You can only act on your own driver records")


async def assert_vehicle_scope(user: Dict[str, Any], vehicle_id: Optional[str]) -> None:
    if is_group_manager(user):
        return
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "country": 1})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    assert_country(user, vehicle.get("country"))


async def assert_driver_scope(user: Dict[str, Any], driver_id: Optional[str]) -> None:
    if is_group_manager(user):
        return
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "country": 1})
    if not driver:
        # Older records store the account id as the driver id.
        driver = await db.users.find_one({"id": driver_id}, {"_id": 0, "country": 1})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    assert_country(user, driver.get("country"))


async def assert_payload_scope(user: Dict[str, Any], payload: Dict[str, Any]) -> None:
    """Check the country, vehicle and driver a create or update points at."""
    if is_group_manager(user):
        return
    if payload.get("country"):
        assert_country(user, payload["country"])
    if payload.get("vehicle_id"):
        await assert_vehicle_scope(user, payload["vehicle_id"])
    if payload.get("driver_id"):
        if is_staff(user):
            await assert_driver_scope(user, payload["driver_id"])
        else:
            assert_own_driver(user, payload["driver_id"])


async def assert_record_scope(user: Dict[str, Any], record: Dict[str, Any]) -> None:
    """Staff check for an existing record, using its country or else its vehicle or driver."""
    if is_group_manager(user):
        return
    if record.get("country"):
        assert_country(user, record["country"])
    elif record.get("vehicle_id"):
        await assert_vehicle_scope(user, record["vehicle_id"])
    elif record.get("driver_id"):
        await assert_driver_scope(user, record["driver_id"])
    else:
        raise HTTPException(status_code=403, detail=_OUT_OF_SCOPE_DETAIL)


async def assert_record_access(user: Dict[str, Any], record: Dict[str, Any]) -> None:
    """Driver-owned record: non-staff must own it, staff must have it in scope."""
    if is_staff(user):
        await assert_record_scope(user, record)
    else:
        assert_own_driver(user, record.get("driver_id"))

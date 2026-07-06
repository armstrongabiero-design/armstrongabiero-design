"""Vehicle routes"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone

from database import db
from models import Vehicle, VehicleCreate, VehicleUpdate, CurrencyEnum
from currency_utils import currency_converter
from auth_deps import get_current_user
from audit_service import assert_can_hard_delete, write_audit_log

router = APIRouter()

_STAFF_ROLES = frozenset({"GROUP_FLEET_MANAGER", "FLEET_MANAGER", "FLEET_OFFICER"})


def _require_staff(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in _STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Staff access required")
    return current_user


@router.post("/vehicles", response_model=Vehicle)
async def create_vehicle(input: VehicleCreate):
    acquisition_cost_usd = currency_converter.convert(
        input.acquisition_cost, input.acquisition_currency, CurrencyEnum.USD
    )
    vehicle_data = input.model_dump()
    vehicle_data['acquisition_cost_usd'] = acquisition_cost_usd
    vehicle = Vehicle(**vehicle_data)
    doc = vehicle.model_dump()
    doc['acquisition_date'] = doc['acquisition_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    await db.vehicles.insert_one(doc)
    return vehicle


@router.get("/vehicles", response_model=List[Vehicle])
async def get_vehicles(country: Optional[str] = None, status: Optional[str] = None):
    query = {}
    if country:
        query['country'] = country
    if status:
        query['status'] = status
    vehicles = await db.vehicles.find(query, {"_id": 0}).to_list(1000)
    for v in vehicles:
        for date_field in ['acquisition_date', 'created_at', 'updated_at']:
            if isinstance(v.get(date_field), str):
                v[date_field] = datetime.fromisoformat(v[date_field])
    return vehicles


@router.get("/vehicles/{vehicle_id}", response_model=Vehicle)
async def get_vehicle(vehicle_id: str):
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    for date_field in ['acquisition_date', 'created_at', 'updated_at']:
        if isinstance(vehicle.get(date_field), str):
            vehicle[date_field] = datetime.fromisoformat(vehicle[date_field])
    return vehicle


@router.put("/vehicles/{vehicle_id}", response_model=Vehicle)
async def update_vehicle(
    vehicle_id: str,
    input: VehicleUpdate,
    current_user: dict = Depends(_require_staff),
):
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if "acquisition_date" in update_data and isinstance(update_data["acquisition_date"], datetime):
        update_data["acquisition_date"] = update_data["acquisition_date"].isoformat()
    if "acquisition_cost" in update_data or "acquisition_currency" in update_data:
        cost = update_data.get("acquisition_cost", vehicle.get("acquisition_cost"))
        currency = update_data.get("acquisition_currency", vehicle.get("acquisition_currency"))
        update_data["acquisition_cost_usd"] = currency_converter.convert(
            cost, currency, CurrencyEnum.USD
        )
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": update_data})
    updated_vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    for date_field in ["acquisition_date", "created_at", "updated_at"]:
        if isinstance(updated_vehicle.get(date_field), str):
            updated_vehicle[date_field] = datetime.fromisoformat(updated_vehicle[date_field])
    return Vehicle(**updated_vehicle)


@router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(
    vehicle_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "vehicle")
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await db.vehicles.delete_one({"id": vehicle_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="vehicle",
        entity_id=vehicle_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={"registration_number": vehicle.get("registration_number")},
    )
    return {"message": "Vehicle deleted successfully"}

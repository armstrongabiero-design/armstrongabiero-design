"""Vehicle routes"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List
from datetime import datetime

from database import db
from models import Vehicle, VehicleCreate, VehicleUpdate, CurrencyEnum
from currency_utils import currency_converter

router = APIRouter()


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
async def update_vehicle(vehicle_id: str, input: VehicleUpdate):
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.utcnow().isoformat()
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": update_data})
    updated_vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    for date_field in ['acquisition_date', 'created_at', 'updated_at']:
        if isinstance(updated_vehicle.get(date_field), str):
            updated_vehicle[date_field] = datetime.fromisoformat(updated_vehicle[date_field])
    return Vehicle(**updated_vehicle)


@router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str):
    result = await db.vehicles.delete_one({"id": vehicle_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"message": "Vehicle deleted successfully"}

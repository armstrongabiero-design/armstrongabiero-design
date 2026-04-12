"""Driver routes"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List
from datetime import datetime

from database import db
from models import Driver, DriverCreate, DriverUpdate

router = APIRouter()


@router.post("/drivers", response_model=Driver)
async def create_driver(input: DriverCreate):
    driver = Driver(**input.model_dump())
    doc = driver.model_dump()
    doc['license_expiry'] = doc['license_expiry'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    await db.drivers.insert_one(doc)
    return driver


@router.get("/drivers", response_model=List[Driver])
async def get_drivers(country: Optional[str] = None):
    query = {}
    if country:
        query['country'] = country
    drivers = await db.drivers.find(query, {"_id": 0}).to_list(1000)
    for d in drivers:
        for date_field in ['license_expiry', 'created_at', 'updated_at']:
            if isinstance(d.get(date_field), str):
                d[date_field] = datetime.fromisoformat(d[date_field])
    return drivers


@router.get("/drivers/{driver_id}", response_model=Driver)
async def get_driver(driver_id: str):
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    for date_field in ['license_expiry', 'created_at', 'updated_at']:
        if isinstance(driver.get(date_field), str):
            driver[date_field] = datetime.fromisoformat(driver[date_field])
    return driver


@router.put("/drivers/{driver_id}", response_model=Driver)
async def update_driver(driver_id: str, input: DriverUpdate):
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if 'license_expiry' in update_data and isinstance(update_data['license_expiry'], datetime):
        update_data['license_expiry'] = update_data['license_expiry'].isoformat()
    update_data['updated_at'] = datetime.utcnow().isoformat()
    await db.drivers.update_one({"id": driver_id}, {"$set": update_data})
    updated_driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    for date_field in ['license_expiry', 'created_at', 'updated_at']:
        if isinstance(updated_driver.get(date_field), str):
            updated_driver[date_field] = datetime.fromisoformat(updated_driver[date_field])
    return Driver(**updated_driver)

"""Maintenance, Workshop, Fleet Manager, and Maintenance Request routes"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone

from database import db
from models import (
    MaintenanceRecord, MaintenanceRecordCreate,
    WorkshopJob, WorkshopJobCreate,
    FleetManager, FleetManagerCreate,
    MaintenanceRequest, MaintenanceRequestCreate, MaintenanceRequestApproval,
    AIPrediction, CurrencyEnum,
)
from auth_service import get_current_user
from currency_utils import currency_converter
from ai_services import ai_service
import email_service

router = APIRouter()


@router.post("/maintenance", response_model=MaintenanceRecord)
async def create_maintenance(input: MaintenanceRecordCreate):
    cost_usd = currency_converter.convert(input.cost, input.currency, CurrencyEnum.USD)
    maintenance_data = input.model_dump()
    maintenance_data['cost_usd'] = cost_usd
    maintenance = MaintenanceRecord(**maintenance_data)
    doc = maintenance.model_dump()
    doc['scheduled_date'] = doc['scheduled_date'].isoformat()
    if doc.get('completed_date'):
        doc['completed_date'] = doc['completed_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.maintenance_records.insert_one(doc)
    return maintenance


@router.get("/maintenance", response_model=List[MaintenanceRecord])
async def get_maintenance_records(vehicle_id: Optional[str] = None):
    query = {}
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    records = await db.maintenance_records.find(query, {"_id": 0}).to_list(1000)
    for r in records:
        if isinstance(r.get('scheduled_date'), str):
            r['scheduled_date'] = datetime.fromisoformat(r['scheduled_date'])
        if r.get('completed_date') and isinstance(r['completed_date'], str):
            r['completed_date'] = datetime.fromisoformat(r['completed_date'])
        if isinstance(r.get('created_at'), str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])
    return records


@router.post("/maintenance/predict/{vehicle_id}")
async def predict_maintenance(vehicle_id: str):
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    last_maintenance = await db.maintenance_records.find_one({"vehicle_id": vehicle_id}, {"_id": 0}, sort=[("created_at", -1)])
    vehicle_data = {
        "vehicle_id": vehicle_id, "make": vehicle.get("make"), "model": vehicle.get("model"),
        "odometer_reading": vehicle.get("odometer_reading"),
        "last_maintenance_date": last_maintenance.get("scheduled_date") if last_maintenance else "Never",
        "harshness_score": 6, "usage_type": "Heavy Duty"
    }
    prediction = await ai_service.predict_maintenance(vehicle_data)
    ai_prediction = AIPrediction(prediction_type="MAINTENANCE", entity_id=vehicle_id, entity_type="VEHICLE", prediction_data=prediction, confidence_score=prediction.get("confidence", 0.8))
    doc = ai_prediction.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.ai_predictions.insert_one(doc)
    return prediction


# Workshop routes
@router.post("/workshops", response_model=WorkshopJob)
async def create_workshop_job(input: WorkshopJobCreate):
    cost_usd = currency_converter.convert(input.cost, input.currency, CurrencyEnum.USD)
    job_data = input.model_dump()
    job_data['cost_usd'] = cost_usd
    job = WorkshopJob(**job_data)
    doc = job.model_dump()
    doc['start_date'] = doc['start_date'].isoformat()
    doc['estimated_completion'] = doc['estimated_completion'].isoformat()
    if doc.get('actual_completion'):
        doc['actual_completion'] = doc['actual_completion'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.workshop_jobs.insert_one(doc)
    return job


@router.get("/workshops", response_model=List[WorkshopJob])
async def get_workshop_jobs(vehicle_id: Optional[str] = None, status: Optional[str] = None):
    query = {}
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    if status:
        query['status'] = status
    jobs = await db.workshop_jobs.find(query, {"_id": 0}).to_list(1000)
    for j in jobs:
        if isinstance(j.get('start_date'), str):
            j['start_date'] = datetime.fromisoformat(j['start_date'])
        if isinstance(j.get('estimated_completion'), str):
            j['estimated_completion'] = datetime.fromisoformat(j['estimated_completion'])
        if j.get('actual_completion') and isinstance(j['actual_completion'], str):
            j['actual_completion'] = datetime.fromisoformat(j['actual_completion'])
        if isinstance(j.get('created_at'), str):
            j['created_at'] = datetime.fromisoformat(j['created_at'])
    return jobs


# Fleet Manager routes
@router.post("/fleet-managers", response_model=FleetManager)
async def create_fleet_manager(input: FleetManagerCreate, current_user: dict = Depends(get_current_user)):
    user_role = current_user.get('role')
    if user_role not in ['GROUP_FLEET_MANAGER', 'FLEET_MANAGER']:
        raise HTTPException(status_code=403, detail="Only Group Fleet Manager or Fleet Manager can add Fleet Managers")
    manager = FleetManager(**input.model_dump())
    doc = manager.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.fleet_managers.insert_one(doc)
    return manager


@router.get("/fleet-managers", response_model=List[FleetManager])
async def get_fleet_managers():
    managers = await db.fleet_managers.find({}, {"_id": 0}).to_list(100)
    for m in managers:
        if isinstance(m.get('created_at'), str):
            m['created_at'] = datetime.fromisoformat(m['created_at'])
    return managers


# Maintenance Request routes
@router.post("/maintenance-requests", response_model=MaintenanceRequest)
async def create_maintenance_request(input: MaintenanceRequestCreate, current_user: dict = Depends(get_current_user)):
    request = MaintenanceRequest(**input.model_dump())
    doc = request.model_dump()
    if input.driver_id != current_user.get('id') and input.driver_id != current_user.get('driver_id'):
        doc['submitted_by_id'] = current_user.get('id')
        doc['submitted_by_name'] = current_user.get('full_name')
        doc['submitted_by_role'] = current_user.get('role')
    if input.country:
        doc['country'] = input.country
    else:
        driver = await db.drivers.find_one({"id": input.driver_id}, {"_id": 0, "country": 1})
        if driver:
            doc['country'] = driver.get('country')
        elif current_user.get('country'):
            doc['country'] = current_user.get('country')
    for field in ['created_at', 'updated_at', 'approved_at', 'rejected_at', 'completed_at']:
        if doc.get(field):
            doc[field] = doc[field].isoformat()
    await db.maintenance_requests.insert_one(doc)
    vehicle = await db.vehicles.find_one({"id": input.vehicle_id}, {"_id": 0})
    driver_info = await db.drivers.find_one({"id": input.driver_id}, {"_id": 0})
    managers = await db.fleet_managers.find({"is_active": True}, {"_id": 0}).to_list(100)
    for manager in managers:
        if manager.get('email'):
            email_service.send_maintenance_request_notification(
                manager['email'],
                {'vehicle_registration': vehicle.get('registration_number', 'N/A') if vehicle else 'N/A', 'driver_name': f"{driver_info.get('first_name', '')} {driver_info.get('last_name', '')}" if driver_info else 'N/A', 'request_type': input.request_type, 'priority': input.priority.value, 'description': input.description}
            )
    for field in ['created_at', 'updated_at', 'approved_at', 'rejected_at', 'completed_at']:
        if doc.get(field) and isinstance(doc[field], str):
            doc[field] = datetime.fromisoformat(doc[field])
    return doc


@router.get("/maintenance-requests", response_model=List[MaintenanceRequest])
async def get_maintenance_requests(status: Optional[str] = None, driver_id: Optional[str] = None, country: Optional[str] = None):
    query = {}
    if status:
        query['status'] = status
    if driver_id:
        query['driver_id'] = driver_id
    if country:
        query['country'] = country
    requests = await db.maintenance_requests.find(query, {"_id": 0}).to_list(1000)
    for r in requests:
        for field in ['created_at', 'updated_at', 'approved_at', 'rejected_at', 'completed_at']:
            if isinstance(r.get(field), str):
                r[field] = datetime.fromisoformat(r[field])
    return requests


@router.get("/maintenance-requests/{request_id}", response_model=MaintenanceRequest)
async def get_maintenance_request(request_id: str):
    request = await db.maintenance_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    for field in ['created_at', 'updated_at', 'approved_at', 'rejected_at', 'completed_at']:
        if isinstance(request.get(field), str):
            request[field] = datetime.fromisoformat(request[field])
    return request


@router.post("/maintenance-requests/{request_id}/approve")
async def approve_maintenance_request(request_id: str, approval: MaintenanceRequestApproval, current_user: dict = Depends(get_current_user)):
    request = await db.maintenance_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if request['status'] != 'PENDING':
        raise HTTPException(status_code=400, detail="Request is not pending")
    now = datetime.now(timezone.utc).isoformat()
    approving_manager_id = current_user.get('id')
    approving_manager_name = current_user.get('full_name')
    approving_manager_role = current_user.get('role')
    if approval.approved:
        update = {"status": "APPROVED", "manager_id": approval.manager_id or approving_manager_id, "approved_by_id": approving_manager_id, "approved_by_name": approving_manager_name, "approved_by_role": approving_manager_role, "approved_at": now, "updated_at": now}
    else:
        if not approval.rejection_reason:
            raise HTTPException(status_code=400, detail="Rejection reason is required")
        update = {"status": "REJECTED", "manager_id": approval.manager_id or approving_manager_id, "rejected_by_id": approving_manager_id, "rejected_by_name": approving_manager_name, "rejected_by_role": approving_manager_role, "rejection_reason": approval.rejection_reason, "rejected_at": now, "updated_at": now}
    await db.maintenance_requests.update_one({"id": request_id}, {"$set": update})
    driver = await db.drivers.find_one({"id": request['driver_id']}, {"_id": 0})
    vehicle = await db.vehicles.find_one({"id": request['vehicle_id']}, {"_id": 0})
    if driver and driver.get('email'):
        email_service.send_request_status_notification(driver['email'], {'vehicle_registration': vehicle.get('registration_number', 'N/A') if vehicle else 'N/A', 'request_type': request.get('request_type', 'N/A')}, "APPROVED" if approval.approved else "REJECTED", approval.rejection_reason)
    return {"status": "success", "message": f"Request {'approved' if approval.approved else 'rejected'}"}

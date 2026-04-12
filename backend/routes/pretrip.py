"""Pre-trip checklist routes"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import base64

from database import db
from models import PreTripChecklist, PreTripChecklistCreate, ChecklistItem, ChecklistItemStatus
from auth_service import get_current_user

router = APIRouter()


@router.post("/pre-trip-checklists", response_model=PreTripChecklist)
async def create_pretrip_checklist(input: PreTripChecklistCreate, current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    existing = await db.pretrip_checklists.find_one({
        "driver_id": input.driver_id, "vehicle_id": input.vehicle_id,
        "date": {"$gte": datetime(today.year, today.month, today.day).isoformat()}
    }, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Checklist already completed for today")
    items = [
        ChecklistItem(item_name="Engine Oil Level", status=input.engine_oil, notes=input.engine_oil_notes),
        ChecklistItem(item_name="Tire Condition & Pressure", status=input.tires, notes=input.tires_notes),
        ChecklistItem(item_name="Brake Functionality", status=input.brakes, notes=input.brakes_notes),
        ChecklistItem(item_name="Lights (Headlights, Indicators, Brake)", status=input.lights, notes=input.lights_notes),
        ChecklistItem(item_name="Fuel Level", status=input.fuel_level, notes=input.fuel_level_notes),
        ChecklistItem(item_name="Mirrors & Wipers", status=input.mirrors_wipers, notes=input.mirrors_wipers_notes),
        ChecklistItem(item_name="Cleanliness & Damage Check", status=input.cleanliness_damage, notes=input.cleanliness_damage_notes),
    ]
    has_failed = any(item.status == ChecklistItemStatus.FAILED for item in items)
    has_attention = any(item.status == ChecklistItemStatus.NEEDS_ATTENTION for item in items)
    overall_status = "FAILED" if has_failed else ("ATTENTION_NEEDED" if has_attention else "PASSED")
    checklist = PreTripChecklist(
        driver_id=input.driver_id, vehicle_id=input.vehicle_id,
        date=datetime.now(timezone.utc), checklist_items=[item.model_dump() for item in items],
        damage_photos=input.damage_photos, overall_status=overall_status,
        completed=True, notes=input.additional_notes
    )
    doc = checklist.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    if input.driver_id != current_user.get('id') and input.driver_id != current_user.get('driver_id'):
        doc['submitted_by_id'] = current_user.get('id')
        doc['submitted_by_name'] = current_user.get('full_name')
        doc['submitted_by_role'] = current_user.get('role')
    await db.pretrip_checklists.insert_one(doc)
    return checklist


@router.get("/pre-trip-checklists", response_model=List[PreTripChecklist])
async def get_pretrip_checklists(driver_id: Optional[str] = None, vehicle_id: Optional[str] = None):
    query = {}
    if driver_id:
        query['driver_id'] = driver_id
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    checklists = await db.pretrip_checklists.find(query, {"_id": 0}).sort("date", -1).to_list(100)
    for c in checklists:
        for field in ['date', 'created_at']:
            if isinstance(c.get(field), str):
                c[field] = datetime.fromisoformat(c[field])
    return checklists


@router.get("/pre-trip-checklists/today/{driver_id}/{vehicle_id}")
async def check_today_checklist(driver_id: str, vehicle_id: str):
    today = datetime.now(timezone.utc).date()
    start_of_day = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    existing = await db.pretrip_checklists.find_one({
        "driver_id": driver_id, "vehicle_id": vehicle_id,
        "date": {"$gte": start_of_day.isoformat()}
    }, {"_id": 0})
    return {
        "completed": existing is not None,
        "checklist": existing,
        "can_log_trips": existing is not None and existing.get('overall_status') != 'FAILED'
    }


@router.post("/pre-trip-checklists/upload-photo")
async def upload_damage_photo(file: UploadFile = File(...)):
    content = await file.read()
    photo_id = str(uuid.uuid4())
    photo_doc = {
        "id": photo_id, "filename": file.filename,
        "content_type": file.content_type,
        "data": base64.b64encode(content).decode('utf-8'),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.damage_photos.insert_one(photo_doc)
    return {"photo_id": photo_id, "url": f"/api/damage-photos/{photo_id}", "message": "Photo uploaded successfully"}


@router.get("/damage-photos/{photo_id}")
async def get_damage_photo(photo_id: str):
    from fastapi.responses import Response
    photo = await db.damage_photos.find_one({"id": photo_id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    content = base64.b64decode(photo['data'])
    return Response(content=content, media_type=photo.get('content_type', 'image/jpeg'))

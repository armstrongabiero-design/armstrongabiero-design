from contextlib import asynccontextmanager
import base64
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Depends, Query, Body, Request, Header
from fastapi.responses import Response
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.middleware.cors import CORSMiddleware

from auth_deps import get_current_user, get_current_user_validated, require_group_manager
from auth_service import (
    assert_jwt_configuration,
    access_token_payload_from_user_record,
    get_password_hash,
    verify_password,
    create_access_token,
)
from currency_utils import currency_converter
from country_utils import normalize_country_code, country_filter_query
from ai_services import ai_service
from email_service import email_service
from database import db, client
from models import (
    Country, CountryCreate, CountryEnum,
    Vehicle, VehicleCreate, VehicleUpdate,
    Driver, DriverCreate, DriverUpdate,
    MaintenanceRecord, MaintenanceRecordCreate,
    WorkshopJob, WorkshopJobCreate,
    InventoryItem, InventoryItemCreate, InventoryItemUpdate,
    InventoryTransaction, InventoryTransactionCreate,
    FuelTransaction, FuelTransactionCreate, FuelTransactionUpdate,
    Expenditure, ExpenditureCreate, ExpenditureUpdate,
    Document, DocumentCreate, DocumentUpdate,
    Asset, AssetCreate, AssetUpdate,
    SafetyIncident, SafetyIncidentCreate, SafetyIncidentUpdate,
    ExchangeRate, ExchangeRateCreate,
    AIPrediction, AIPredictionCreate,
    CurrencyEnum, DocumentType,
    MaintenanceRequest, MaintenanceRequestCreate, MaintenanceRequestUpdate, MaintenanceRequestApproval,
    PreTripChecklist, PreTripChecklistCreate, PreTripChecklistUpdate, ChecklistItem, ChecklistItemStatus,
    FleetManager, FleetManagerCreate, RequestStatus, RequestPriority,
    User, UserSelfRegister, UserLogin, UserUpdate, UserRole, Token,
    BootstrapGroupFleetManagerRequest,
    Tire, TireCreate, TireUpdate, TireRotation, TireRotationCreate, TirePosition, TireStatus,
    LogbookEntry, LogbookEntryCreate, LogbookEntryUpdate,
    Vendor, VendorCreate, VendorUpdate, VendorCategory,
    VehicleLocation, VehicleLocationCreate,
    Alert, AlertType, AlertSeverity,
    TCORecord, ComplianceCheck, ComplianceStatus, ExpenseCategory,
    ForgotPasswordRequest, ResetPasswordRequest, PasswordResetToken
)
from audit_service import assert_can_hard_delete, write_audit_log
from storage_service import upload_bytes, read_bytes, delete_object, presigned_download_url, storage_enabled
from security_middleware import JWTAuthMiddleware

limiter = Limiter(key_func=get_remote_address)

_STAFF_ROLES = frozenset({"GROUP_FLEET_MANAGER", "FLEET_MANAGER", "FLEET_OFFICER"})


def _require_staff(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in _STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Staff access required")
    return current_user


def _mongo_update_payload(update_data: dict) -> dict:
    payload = dict(update_data)
    for key, val in list(payload.items()):
        if hasattr(val, "isoformat"):
            payload[key] = val.isoformat()
        elif hasattr(val, "value"):
            payload[key] = val.value
    return payload


_PRETRIP_ITEM_DEFS = [
    ("Engine Oil Level", "engine_oil", "engine_oil_notes"),
    ("Tire Condition & Pressure", "tires", "tires_notes"),
    ("Brake Functionality", "brakes", "brakes_notes"),
    ("Lights (Headlights, Indicators, Brake)", "lights", "lights_notes"),
    ("Fuel Level", "fuel_level", "fuel_level_notes"),
    ("Mirrors & Wipers", "mirrors_wipers", "mirrors_wipers_notes"),
    ("Cleanliness & Damage Check", "cleanliness_damage", "cleanliness_damage_notes"),
]
_PRETRIP_ITEM_NAME_TO_KEYS = {name: (status_key, notes_key) for name, status_key, notes_key in _PRETRIP_ITEM_DEFS}


def _pretrip_doc_to_fields(doc: dict) -> dict:
    fields = {
        "driver_id": doc.get("driver_id"),
        "vehicle_id": doc.get("vehicle_id"),
        "damage_photos": doc.get("damage_photos") or [],
        "additional_notes": doc.get("notes"),
    }
    for item in doc.get("checklist_items") or []:
        keys = _PRETRIP_ITEM_NAME_TO_KEYS.get(item.get("item_name"))
        if keys:
            fields[keys[0]] = item.get("status")
            fields[keys[1]] = item.get("notes")
    return fields


def _pretrip_build_items_and_status(fields: dict) -> tuple:
    items = []
    for item_name, status_key, notes_key in _PRETRIP_ITEM_DEFS:
        status = fields.get(status_key)
        if status is None:
            continue
        if not isinstance(status, ChecklistItemStatus):
            status = ChecklistItemStatus(status)
        items.append(
            ChecklistItem(item_name=item_name, status=status, notes=fields.get(notes_key)).model_dump()
        )
    has_failed = any(i["status"] == ChecklistItemStatus.FAILED.value for i in items)
    has_attention = any(i["status"] == ChecklistItemStatus.NEEDS_ATTENTION.value for i in items)
    overall = "FAILED" if has_failed else ("ATTENTION_NEEDED" if has_attention else "PASSED")
    return items, overall


def _assert_can_edit_pretrip(current_user: dict, checklist: dict) -> None:
    if current_user.get("role") in _STAFF_ROLES:
        return
    user_driver_id = current_user.get("driver_id") or current_user.get("id")
    if checklist.get("driver_id") == user_driver_id:
        return
    raise HTTPException(status_code=403, detail="You do not have permission to edit this checklist")

_ENV = os.environ.get("ENVIRONMENT", "development").lower()
_IS_PRODUCTION = _ENV == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    assert_jwt_configuration()
    try:
        from country_migration import migrate_countries_to_iso
        n = await migrate_countries_to_iso()
        if n:
            logging.getLogger(__name__).info("Migrated %s document(s) to ISO country codes", n)
    except Exception as exc:
        logging.getLogger(__name__).warning("Country ISO migration skipped: %s", exc)
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(
    title="GTI Fleet",
    lifespan=lifespan,
    docs_url=None if _IS_PRODUCTION else "/docs",
    redoc_url=None if _IS_PRODUCTION else "/redoc",
    openapi_url=None if _IS_PRODUCTION else "/openapi.json",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ============= COUNTRY ROUTES =============
@api_router.post("/countries", response_model=Country)
async def create_country(input: CountryCreate):
    country = Country(**input.model_dump())
    doc = country.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.countries.insert_one(doc)
    return country


@api_router.get("/countries", response_model=List[Country])
async def get_countries():
    countries = await db.countries.find({}, {"_id": 0}).to_list(100)
    for c in countries:
        if isinstance(c.get('created_at'), str):
            c['created_at'] = datetime.fromisoformat(c['created_at'])
    return countries


@api_router.get("/countries/all-list")
async def get_all_countries_list():
    """Get list of all countries for registration - static list"""
    countries = [
        {"code": "AF", "name": "Afghanistan"},
        {"code": "AL", "name": "Albania"},
        {"code": "DZ", "name": "Algeria"},
        {"code": "AO", "name": "Angola"},
        {"code": "AR", "name": "Argentina"},
        {"code": "AU", "name": "Australia"},
        {"code": "AT", "name": "Austria"},
        {"code": "BD", "name": "Bangladesh"},
        {"code": "BE", "name": "Belgium"},
        {"code": "BJ", "name": "Benin"},
        {"code": "BW", "name": "Botswana"},
        {"code": "BR", "name": "Brazil"},
        {"code": "BF", "name": "Burkina Faso"},
        {"code": "BI", "name": "Burundi"},
        {"code": "CM", "name": "Cameroon"},
        {"code": "CA", "name": "Canada"},
        {"code": "CV", "name": "Cape Verde"},
        {"code": "CF", "name": "Central African Republic"},
        {"code": "TD", "name": "Chad"},
        {"code": "CN", "name": "China"},
        {"code": "CO", "name": "Colombia"},
        {"code": "KM", "name": "Comoros"},
        {"code": "CG", "name": "Congo"},
        {"code": "CD", "name": "Congo (DRC)"},
        {"code": "CI", "name": "Côte d'Ivoire"},
        {"code": "HR", "name": "Croatia"},
        {"code": "CZ", "name": "Czech Republic"},
        {"code": "DK", "name": "Denmark"},
        {"code": "DJ", "name": "Djibouti"},
        {"code": "EG", "name": "Egypt"},
        {"code": "GQ", "name": "Equatorial Guinea"},
        {"code": "ER", "name": "Eritrea"},
        {"code": "ET", "name": "Ethiopia"},
        {"code": "FI", "name": "Finland"},
        {"code": "FR", "name": "France"},
        {"code": "GA", "name": "Gabon"},
        {"code": "GM", "name": "Gambia"},
        {"code": "DE", "name": "Germany"},
        {"code": "GH", "name": "Ghana"},
        {"code": "GR", "name": "Greece"},
        {"code": "GN", "name": "Guinea"},
        {"code": "GW", "name": "Guinea-Bissau"},
        {"code": "HU", "name": "Hungary"},
        {"code": "IN", "name": "India"},
        {"code": "ID", "name": "Indonesia"},
        {"code": "IE", "name": "Ireland"},
        {"code": "IL", "name": "Israel"},
        {"code": "IT", "name": "Italy"},
        {"code": "JP", "name": "Japan"},
        {"code": "KE", "name": "Kenya"},
        {"code": "KR", "name": "South Korea"},
        {"code": "LR", "name": "Liberia"},
        {"code": "LY", "name": "Libya"},
        {"code": "MG", "name": "Madagascar"},
        {"code": "MW", "name": "Malawi"},
        {"code": "MY", "name": "Malaysia"},
        {"code": "ML", "name": "Mali"},
        {"code": "MR", "name": "Mauritania"},
        {"code": "MU", "name": "Mauritius"},
        {"code": "MX", "name": "Mexico"},
        {"code": "MA", "name": "Morocco"},
        {"code": "MZ", "name": "Mozambique"},
        {"code": "NA", "name": "Namibia"},
        {"code": "NL", "name": "Netherlands"},
        {"code": "NZ", "name": "New Zealand"},
        {"code": "NE", "name": "Niger"},
        {"code": "NG", "name": "Nigeria"},
        {"code": "NO", "name": "Norway"},
        {"code": "PK", "name": "Pakistan"},
        {"code": "PH", "name": "Philippines"},
        {"code": "PL", "name": "Poland"},
        {"code": "PT", "name": "Portugal"},
        {"code": "RO", "name": "Romania"},
        {"code": "RU", "name": "Russia"},
        {"code": "RW", "name": "Rwanda"},
        {"code": "ST", "name": "São Tomé and Príncipe"},
        {"code": "SA", "name": "Saudi Arabia"},
        {"code": "SN", "name": "Senegal"},
        {"code": "SC", "name": "Seychelles"},
        {"code": "SL", "name": "Sierra Leone"},
        {"code": "SG", "name": "Singapore"},
        {"code": "ZA", "name": "South Africa"},
        {"code": "SS", "name": "South Sudan"},
        {"code": "ES", "name": "Spain"},
        {"code": "SD", "name": "Sudan"},
        {"code": "SZ", "name": "Eswatini"},
        {"code": "SE", "name": "Sweden"},
        {"code": "CH", "name": "Switzerland"},
        {"code": "TZ", "name": "Tanzania"},
        {"code": "TH", "name": "Thailand"},
        {"code": "TG", "name": "Togo"},
        {"code": "TN", "name": "Tunisia"},
        {"code": "TR", "name": "Turkey"},
        {"code": "UG", "name": "Uganda"},
        {"code": "UA", "name": "Ukraine"},
        {"code": "AE", "name": "United Arab Emirates"},
        {"code": "GB", "name": "United Kingdom"},
        {"code": "US", "name": "United States"},
        {"code": "ZM", "name": "Zambia"},
        {"code": "ZW", "name": "Zimbabwe"}
    ]
    return {"countries": countries}


@api_router.get("/countries/{country_name}", response_model=Country)
async def get_country(country_name: str):
    country = await db.countries.find_one({"name": country_name}, {"_id": 0})
    if not country:
        raise HTTPException(status_code=404, detail="Country not found")
    if isinstance(country.get('created_at'), str):
        country['created_at'] = datetime.fromisoformat(country['created_at'])
    return country


# ============= VEHICLE ROUTES =============
@api_router.post("/vehicles", response_model=Vehicle)
async def create_vehicle(input: VehicleCreate):
    # Convert acquisition cost to USD
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


@api_router.get("/vehicles", response_model=List[Vehicle])
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


@api_router.get("/vehicles/{vehicle_id}", response_model=Vehicle)
async def get_vehicle(vehicle_id: str):
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    for date_field in ['acquisition_date', 'created_at', 'updated_at']:
        if isinstance(vehicle.get(date_field), str):
            vehicle[date_field] = datetime.fromisoformat(vehicle[date_field])
    return vehicle


@api_router.put("/vehicles/{vehicle_id}", response_model=Vehicle)
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


@api_router.delete("/vehicles/{vehicle_id}")
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
        details={
            "registration_number": vehicle.get("registration_number"),
            "make": vehicle.get("make"),
            "model": vehicle.get("model"),
        },
    )
    return {"message": "Vehicle deleted successfully"}


# ============= DRIVER ROUTES =============
@api_router.post("/drivers", response_model=Driver)
async def create_driver(input: DriverCreate):
    driver = Driver(**input.model_dump())
    doc = driver.model_dump()
    doc['license_expiry'] = doc['license_expiry'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.drivers.insert_one(doc)
    return driver


@api_router.get("/drivers", response_model=List[Driver])
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


@api_router.get("/drivers/{driver_id}", response_model=Driver)
async def get_driver(driver_id: str):
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    for date_field in ['license_expiry', 'created_at', 'updated_at']:
        if isinstance(driver.get(date_field), str):
            driver[date_field] = datetime.fromisoformat(driver[date_field])
    return driver


@api_router.put("/drivers/{driver_id}", response_model=Driver)
async def update_driver(
    driver_id: str,
    input: DriverUpdate,
    current_user: dict = Depends(_require_staff),
):
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if "license_expiry" in update_data and isinstance(update_data["license_expiry"], datetime):
        update_data["license_expiry"] = update_data["license_expiry"].isoformat()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.drivers.update_one({"id": driver_id}, {"$set": update_data})
    updated_driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})

    for date_field in ["license_expiry", "created_at", "updated_at"]:
        if isinstance(updated_driver.get(date_field), str):
            updated_driver[date_field] = datetime.fromisoformat(updated_driver[date_field])

    return Driver(**updated_driver)


@api_router.delete("/drivers/{driver_id}")
async def delete_driver(
    driver_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "driver")
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    await db.drivers.delete_one({"id": driver_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="driver",
        entity_id=driver_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={
            "first_name": driver.get("first_name"),
            "last_name": driver.get("last_name"),
            "license_number": driver.get("license_number"),
        },
    )
    return {"message": "Driver deleted successfully"}


# ============= MAINTENANCE ROUTES =============
@api_router.post("/maintenance", response_model=MaintenanceRecord)
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


@api_router.get("/maintenance", response_model=List[MaintenanceRecord])
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


@api_router.post("/maintenance/predict/{vehicle_id}")
async def predict_maintenance(vehicle_id: str):
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    # Get last maintenance
    last_maintenance = await db.maintenance_records.find_one(
        {"vehicle_id": vehicle_id},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    
    vehicle_data = {
        "vehicle_id": vehicle_id,
        "make": vehicle.get("make"),
        "model": vehicle.get("model"),
        "odometer_reading": vehicle.get("odometer_reading"),
        "last_maintenance_date": last_maintenance.get("scheduled_date") if last_maintenance else "Never",
        "harshness_score": 6,  # This would come from telematics data
        "usage_type": "Heavy Duty"
    }
    
    prediction = await ai_service.predict_maintenance(vehicle_data)
    
    # Store prediction
    ai_prediction = AIPrediction(
        prediction_type="MAINTENANCE",
        entity_id=vehicle_id,
        entity_type="VEHICLE",
        prediction_data=prediction,
        confidence_score=prediction.get("confidence", 0.8)
    )
    
    doc = ai_prediction.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.ai_predictions.insert_one(doc)
    
    return prediction


# ============= WORKSHOP ROUTES =============
@api_router.post("/workshops", response_model=WorkshopJob)
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


@api_router.get("/workshops", response_model=List[WorkshopJob])
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


# ============= INVENTORY ROUTES =============
@api_router.post("/inventory", response_model=InventoryItem)
async def create_inventory_item(input: InventoryItemCreate):
    unit_cost_usd = currency_converter.convert(input.unit_cost, input.currency, CurrencyEnum.USD)
    
    item_data = input.model_dump()
    item_data['unit_cost_usd'] = unit_cost_usd
    item = InventoryItem(**item_data)
    
    doc = item.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.inventory_items.insert_one(doc)
    return item


@api_router.get("/inventory", response_model=List[InventoryItem])
async def get_inventory_items(country: Optional[str] = None, low_stock: bool = False):
    query = {}
    if country:
        query['country'] = country
    
    items = await db.inventory_items.find(query, {"_id": 0}).to_list(1000)
    
    for item in items:
        if isinstance(item.get('created_at'), str):
            item['created_at'] = datetime.fromisoformat(item['created_at'])
        if isinstance(item.get('updated_at'), str):
            item['updated_at'] = datetime.fromisoformat(item['updated_at'])
    
    if low_stock:
        items = [item for item in items if item['quantity'] <= item['reorder_level']]
    
    return items


@api_router.put("/inventory/{item_id}")
async def update_inventory_item(
    item_id: str,
    input: InventoryItemUpdate,
    current_user: dict = Depends(_require_staff),
):
    update_data = input.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    existing = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    if "unit_cost" in update_data or "currency" in update_data:
        cost = update_data.get("unit_cost", existing.get("unit_cost"))
        currency = update_data.get("currency", existing.get("currency"))
        update_data["unit_cost_usd"] = currency_converter.convert(cost, currency, CurrencyEnum.USD)

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data = _mongo_update_payload(update_data)
    await db.inventory_items.update_one({"id": item_id}, {"$set": update_data})
    return {"status": "success"}


@api_router.delete("/inventory/{item_id}")
async def delete_inventory_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "inventory_item")
    item = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    await db.inventory_items.delete_one({"id": item_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="inventory_item",
        entity_id=item_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={"name": item.get("name"), "sku": item.get("sku")},
    )
    return {"message": "Inventory item deleted successfully"}


@api_router.post("/inventory/transactions", response_model=InventoryTransaction)
async def create_inventory_transaction(input: InventoryTransactionCreate):
    transaction = InventoryTransaction(**input.model_dump())
    
    # Update item quantity
    item = await db.inventory_items.find_one({"id": input.item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    quantity_change = input.quantity if input.transaction_type in ["PURCHASE", "ADJUSTMENT"] else -input.quantity
    new_quantity = item['quantity'] + quantity_change
    
    if new_quantity < 0:
        raise HTTPException(status_code=400, detail="Insufficient inventory")
    
    await db.inventory_items.update_one(
        {"id": input.item_id},
        {"$set": {"quantity": new_quantity, "updated_at": datetime.utcnow().isoformat()}}
    )
    
    doc = transaction.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.inventory_transactions.insert_one(doc)
    
    return transaction


@api_router.get("/inventory/transactions", response_model=List[InventoryTransaction])
async def get_inventory_transactions(item_id: Optional[str] = None):
    query = {}
    if item_id:
        query['item_id'] = item_id
    
    transactions = await db.inventory_transactions.find(query, {"_id": 0}).to_list(1000)
    for t in transactions:
        if isinstance(t.get('created_at'), str):
            t['created_at'] = datetime.fromisoformat(t['created_at'])
    return transactions


# ============= FUEL ROUTES =============
@api_router.post("/fuel", response_model=FuelTransaction)
async def create_fuel_transaction(input: FuelTransactionCreate, current_user: dict = Depends(get_current_user)):
    cost_usd = currency_converter.convert(input.cost, input.currency, CurrencyEnum.USD)
    
    # Get previous fuel transaction to calculate efficiency
    prev_fuel = await db.fuel_transactions.find_one(
        {"vehicle_id": input.vehicle_id},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    
    fuel_efficiency = None
    if prev_fuel:
        odometer_change = input.odometer_reading - prev_fuel.get('odometer_reading', 0)
        if odometer_change > 0 and input.quantity_liters > 0:
            fuel_efficiency = round(odometer_change / input.quantity_liters, 2)
    
    fuel_data = input.model_dump()
    fuel_data['cost_usd'] = cost_usd
    fuel_data['fuel_efficiency'] = fuel_efficiency
    fuel_transaction = FuelTransaction(**fuel_data)
    
    # Check for anomalies
    if fuel_efficiency:
        anomaly_data = {
            "vehicle_id": input.vehicle_id,
            "quantity_liters": input.quantity_liters,
            "cost": input.cost,
            "currency": input.currency.value,
            "odometer_change": odometer_change if prev_fuel else 0,
            "avg_efficiency": fuel_efficiency,
            "location": input.location
        }
        anomaly_result = await ai_service.analyze_fuel_anomaly(anomaly_data)
        
        fuel_transaction.anomaly_detected = anomaly_result.get("anomaly_detected", False)
        fuel_transaction.anomaly_reason = anomaly_result.get("explanation", "")
    
    doc = fuel_transaction.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    
    # Track who submitted this entry (especially if on behalf of another driver)
    if input.driver_id and input.driver_id != current_user.get('id') and input.driver_id != current_user.get('driver_id'):
        doc['submitted_by_id'] = current_user.get('id')
        doc['submitted_by_name'] = current_user.get('full_name')
        doc['submitted_by_role'] = current_user.get('role')
    
    await db.fuel_transactions.insert_one(doc)
    return fuel_transaction


@api_router.get("/fuel", response_model=List[FuelTransaction])
async def get_fuel_transactions(vehicle_id: Optional[str] = None, anomalies_only: bool = False):
    query = {}
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    if anomalies_only:
        query['anomaly_detected'] = True
    
    transactions = await db.fuel_transactions.find(query, {"_id": 0}).to_list(1000)
    for t in transactions:
        if isinstance(t.get('date'), str):
            t['date'] = datetime.fromisoformat(t['date'])
        if isinstance(t.get('created_at'), str):
            t['created_at'] = datetime.fromisoformat(t['created_at'])
    return transactions


@api_router.put("/fuel/{transaction_id}")
async def update_fuel_transaction(
    transaction_id: str,
    input: FuelTransactionUpdate,
    current_user: dict = Depends(_require_staff),
):
    update_data = input.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    existing = await db.fuel_transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Fuel transaction not found")

    vehicle_id = update_data.get("vehicle_id", existing.get("vehicle_id"))
    odometer = update_data.get("odometer_reading", existing.get("odometer_reading"))
    quantity = update_data.get("quantity_liters", existing.get("quantity_liters"))

    if "cost" in update_data or "currency" in update_data:
        cost = update_data.get("cost", existing.get("cost"))
        currency = update_data.get("currency", existing.get("currency"))
        update_data["cost_usd"] = currency_converter.convert(cost, currency, CurrencyEnum.USD)

    if any(k in update_data for k in ("vehicle_id", "odometer_reading", "quantity_liters")):
        prev_fuel = await db.fuel_transactions.find_one(
            {"vehicle_id": vehicle_id, "id": {"$ne": transaction_id}},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        fuel_efficiency = None
        if prev_fuel and odometer and quantity:
            odometer_change = odometer - prev_fuel.get("odometer_reading", 0)
            if odometer_change > 0 and quantity > 0:
                fuel_efficiency = round(odometer_change / quantity, 2)
        update_data["fuel_efficiency"] = fuel_efficiency

    update_data = _mongo_update_payload(update_data)
    await db.fuel_transactions.update_one({"id": transaction_id}, {"$set": update_data})
    return {"status": "success"}


@api_router.delete("/fuel/{transaction_id}")
async def delete_fuel_transaction(
    transaction_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "fuel_transaction")
    txn = await db.fuel_transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Fuel transaction not found")

    await db.fuel_transactions.delete_one({"id": transaction_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="fuel_transaction",
        entity_id=transaction_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={"vehicle_id": txn.get("vehicle_id"), "cost_usd": txn.get("cost_usd")},
    )
    return {"message": "Fuel transaction deleted successfully"}


# ============= EXPENDITURE ROUTES =============
@api_router.post("/expenditures", response_model=Expenditure)
async def create_expenditure(input: ExpenditureCreate):
    amount_usd = currency_converter.convert(input.amount, input.currency, CurrencyEnum.USD)
    
    expenditure_data = input.model_dump()
    expenditure_data['amount_usd'] = amount_usd
    expenditure = Expenditure(**expenditure_data)
    
    doc = expenditure.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.expenditures.insert_one(doc)
    return expenditure


@api_router.get("/expenditures", response_model=List[Expenditure])
async def get_expenditures(country: Optional[str] = None, category: Optional[str] = None):
    query = {}
    if country:
        query['country'] = country
    if category:
        query['category'] = category
    
    expenditures = await db.expenditures.find(query, {"_id": 0}).to_list(1000)
    for e in expenditures:
        if isinstance(e.get('date'), str):
            e['date'] = datetime.fromisoformat(e['date'])
        if isinstance(e.get('created_at'), str):
            e['created_at'] = datetime.fromisoformat(e['created_at'])
    return expenditures


@api_router.put("/expenditures/{expenditure_id}")
async def update_expenditure(
    expenditure_id: str,
    input: ExpenditureUpdate,
    current_user: dict = Depends(_require_staff),
):
    update_data = input.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    existing = await db.expenditures.find_one({"id": expenditure_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Expenditure not found")

    if "amount" in update_data or "currency" in update_data:
        amount = update_data.get("amount", existing.get("amount"))
        currency = update_data.get("currency", existing.get("currency"))
        update_data["amount_usd"] = currency_converter.convert(amount, currency, CurrencyEnum.USD)

    update_data = _mongo_update_payload(update_data)
    await db.expenditures.update_one({"id": expenditure_id}, {"$set": update_data})
    return {"status": "success"}


@api_router.delete("/expenditures/{expenditure_id}")
async def delete_expenditure(
    expenditure_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "expenditure")
    expenditure = await db.expenditures.find_one({"id": expenditure_id}, {"_id": 0})
    if not expenditure:
        raise HTTPException(status_code=404, detail="Expenditure not found")

    await db.expenditures.delete_one({"id": expenditure_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="expenditure",
        entity_id=expenditure_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={"category": expenditure.get("category"), "amount_usd": expenditure.get("amount_usd")},
    )
    return {"message": "Expenditure deleted successfully"}


# ============= DOCUMENT ROUTES =============
_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
_ALLOWED_DOCUMENT_CONTENT_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "application/pdf",
    }
)


def _parse_ocr_date(value) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return None


def _document_ocr_updates(ocr_result: dict) -> dict:
    updates = {
        "ocr_processed": True,
        "ocr_data": ocr_result,
        "validated": ocr_result.get("validation_status") == "VALID",
    }
    if ocr_result.get("document_number"):
        updates["document_number"] = ocr_result["document_number"]
    issue = _parse_ocr_date(ocr_result.get("issue_date"))
    if issue:
        updates["issue_date"] = issue
    expiry = _parse_ocr_date(ocr_result.get("expiry_date"))
    if expiry:
        updates["expiry_date"] = expiry
    status = ocr_result.get("validation_status")
    if status == "EXPIRED":
        updates["validation_notes"] = "Document marked expired by OCR"
    elif status == "INVALID":
        updates["validation_notes"] = "Document marked invalid by OCR"
    elif status == "VALID":
        updates["validation_notes"] = None
    return updates


@api_router.post("/documents", response_model=Document)
async def create_document(input: DocumentCreate):
    document = Document(**input.model_dump())
    
    doc = document.model_dump()
    doc['issue_date'] = doc['issue_date'].isoformat()
    doc['expiry_date'] = doc['expiry_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.documents.insert_one(doc)
    return document


@api_router.get("/documents", response_model=List[Document])
async def get_documents(entity_id: Optional[str] = None, document_type: Optional[str] = None):
    query = {}
    if entity_id:
        query['entity_id'] = entity_id
    if document_type:
        query['document_type'] = document_type
    
    documents = await db.documents.find(query, {"_id": 0}).to_list(1000)
    for d in documents:
        if isinstance(d.get('issue_date'), str):
            d['issue_date'] = datetime.fromisoformat(d['issue_date'])
        if isinstance(d.get('expiry_date'), str):
            d['expiry_date'] = datetime.fromisoformat(d['expiry_date'])
        if isinstance(d.get('created_at'), str):
            d['created_at'] = datetime.fromisoformat(d['created_at'])
    return documents


    return documents


@api_router.post("/documents/{document_id}/upload")
async def upload_document_file(
    document_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(_require_staff),
):
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in _ALLOWED_DOCUMENT_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: PDF and images ({', '.join(sorted(_ALLOWED_DOCUMENT_CONTENT_TYPES))})",
        )

    content = await file.read()
    if len(content) > _DOCUMENT_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large (max {_DOCUMENT_MAX_BYTES // (1024 * 1024)} MB)",
        )

    old_key = document.get("s3_key")
    object_key, file_ref = upload_bytes(
        document_id=document_id,
        content=content,
        content_type=content_type,
        filename=file.filename or "document",
    )

    await db.documents.update_one(
        {"id": document_id},
        {"$set": {
            "s3_key": object_key,
            "file_url": file_ref,
            "original_filename": file.filename,
            "content_type": content_type,
        }},
    )

    if old_key and old_key != object_key:
        delete_object(old_key)

    return {
        "message": "File uploaded successfully",
        "s3_key": object_key,
        "file_url": file_ref,
        "storage": "s3" if storage_enabled() else "local",
    }


@api_router.get("/documents/{document_id}/download-url")
async def get_document_download_url(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if not document.get("s3_key"):
        raise HTTPException(status_code=404, detail="No file uploaded for this document")

    if storage_enabled():
        url = presigned_download_url(document["s3_key"])
        if not url:
            raise HTTPException(status_code=503, detail="Could not generate download URL")
        return {"url": url, "expires_in": int(os.environ.get("S3_PRESIGNED_URL_EXPIRY", "3600"))}

    return {"url": f"/api/documents/{document_id}/file", "expires_in": None}


@api_router.get("/documents/{document_id}/file")
async def get_document_file(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    if storage_enabled():
        raise HTTPException(status_code=404, detail="Use download-url for S3-backed documents")

    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document or not document.get("s3_key"):
        raise HTTPException(status_code=404, detail="Document file not found")

    content = read_bytes(document["s3_key"])
    if content is None:
        raise HTTPException(status_code=404, detail="Document file not found")

    media_type = document.get("content_type") or "application/octet-stream"
    filename = document.get("original_filename") or f"document-{document_id}"
    headers = {"Content-Disposition": f'inline; filename="{filename}"'}
    return Response(content=content, media_type=media_type, headers=headers)


@api_router.post("/documents/{document_id}/ocr")
async def process_document_ocr(
    document_id: str,
    file: Optional[UploadFile] = File(None),
    current_user: dict = Depends(_require_staff),
):
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    image_bytes = None
    if file and file.filename:
        content_type = (file.content_type or "").split(";")[0].strip().lower()
        if content_type not in _ALLOWED_DOCUMENT_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail="Invalid file type for OCR")
        image_bytes = await file.read()
        if len(image_bytes) > _DOCUMENT_MAX_BYTES:
            raise HTTPException(status_code=400, detail="File too large for OCR")
    elif document.get("s3_key"):
        image_bytes = read_bytes(document["s3_key"])
        if image_bytes is None:
            raise HTTPException(status_code=404, detail="Stored document file not found")
    else:
        raise HTTPException(status_code=400, detail="Upload a document file before running OCR")

    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    ocr_result = await ai_service.ocr_document(
        image_base64,
        document.get("document_type"),
        document.get("country"),
    )

    updates = _document_ocr_updates(ocr_result)
    await db.documents.update_one({"id": document_id}, {"$set": updates})

    return ocr_result


@api_router.put("/documents/{document_id}", response_model=Document)
async def update_document(
    document_id: str,
    input: DocumentUpdate,
    current_user: dict = Depends(_require_staff),
):
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    update_data = _mongo_update_payload({k: v for k, v in input.model_dump().items() if v is not None})
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db.documents.update_one({"id": document_id}, {"$set": update_data})
    updated = await db.documents.find_one({"id": document_id}, {"_id": 0})
    for field in ["issue_date", "expiry_date", "created_at"]:
        if isinstance(updated.get(field), str):
            updated[field] = datetime.fromisoformat(updated[field])
    return Document(**updated)


@api_router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "document")
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.get("s3_key"):
        delete_object(document["s3_key"])

    await db.documents.delete_one({"id": document_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="document",
        entity_id=document_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={
            "document_type": document.get("document_type"),
            "document_number": document.get("document_number"),
        },
    )
    return {"message": "Document deleted successfully"}


# ============= ASSET ROUTES =============
@api_router.post("/assets", response_model=Asset)
async def create_asset(input: AssetCreate):
    acquisition_cost_usd = currency_converter.convert(
        input.acquisition_cost, input.currency, CurrencyEnum.USD
    )
    
    asset_data = input.model_dump()
    asset_data['acquisition_cost_usd'] = acquisition_cost_usd
    asset_data['current_value'] = input.acquisition_cost
    asset_data['current_value_usd'] = acquisition_cost_usd
    
    asset = Asset(**asset_data)
    
    doc = asset.model_dump()
    doc['acquisition_date'] = doc['acquisition_date'].isoformat()
    if doc.get('disposal_date'):
        doc['disposal_date'] = doc['disposal_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.assets.insert_one(doc)
    return asset


@api_router.get("/assets", response_model=List[Asset])
async def get_assets(vehicle_id: Optional[str] = None):
    query = {}
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    
    assets = await db.assets.find(query, {"_id": 0}).to_list(1000)
    for a in assets:
        if isinstance(a.get('acquisition_date'), str):
            a['acquisition_date'] = datetime.fromisoformat(a['acquisition_date'])
        if a.get('disposal_date') and isinstance(a['disposal_date'], str):
            a['disposal_date'] = datetime.fromisoformat(a['disposal_date'])
        if isinstance(a.get('created_at'), str):
            a['created_at'] = datetime.fromisoformat(a['created_at'])
        if isinstance(a.get('updated_at'), str):
            a['updated_at'] = datetime.fromisoformat(a['updated_at'])
    return assets


@api_router.post("/assets/{asset_id}/predict-resale")
async def predict_asset_resale(asset_id: str):
    asset = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    vehicle = await db.vehicles.find_one({"id": asset['vehicle_id']}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    # Calculate age
    acquisition_date = datetime.fromisoformat(asset['acquisition_date']) if isinstance(asset['acquisition_date'], str) else asset['acquisition_date']
    # Make both datetimes timezone-naive for comparison
    if acquisition_date.tzinfo is not None:
        acquisition_date = acquisition_date.replace(tzinfo=None)
    age_years = (datetime.utcnow() - acquisition_date).days / 365.25
    
    asset_data = {
        "vehicle_id": vehicle['id'],
        "make": vehicle.get("make"),
        "model": vehicle.get("model"),
        "year": vehicle.get("year"),
        "age_years": round(age_years, 1),
        "odometer": vehicle.get("odometer_reading"),
        "condition": "Good",
        "maintenance_score": "Average",
        "country": vehicle.get("country"),
        "original_cost_usd": asset.get("acquisition_cost_usd")
    }
    
    prediction = await ai_service.predict_resale_value(asset_data)
    
    # Update asset with prediction
    await db.assets.update_one(
        {"id": asset_id},
        {"$set": {
            "predicted_resale_value": prediction.get("predicted_value_usd"),
            "updated_at": datetime.utcnow().isoformat()
        }}
    )
    
    return prediction


@api_router.put("/assets/{asset_id}")
async def update_asset(
    asset_id: str,
    input: AssetUpdate,
    current_user: dict = Depends(_require_staff),
):
    update_data = input.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    existing = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Asset not found")

    if "acquisition_cost" in update_data or "currency" in update_data:
        cost = update_data.get("acquisition_cost", existing.get("acquisition_cost"))
        currency = update_data.get("currency", existing.get("currency"))
        cost_usd = currency_converter.convert(cost, currency, CurrencyEnum.USD)
        update_data["acquisition_cost_usd"] = cost_usd
        if "current_value" not in update_data:
            update_data["current_value"] = cost
            update_data["current_value_usd"] = cost_usd
    elif "current_value" in update_data and "current_value_usd" not in update_data:
        currency = update_data.get("currency", existing.get("currency"))
        update_data["current_value_usd"] = currency_converter.convert(
            update_data["current_value"], currency, CurrencyEnum.USD
        )

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data = _mongo_update_payload(update_data)
    await db.assets.update_one({"id": asset_id}, {"$set": update_data})
    return {"status": "success"}


@api_router.delete("/assets/{asset_id}")
async def delete_asset(
    asset_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "asset")
    asset = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    await db.assets.delete_one({"id": asset_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="asset",
        entity_id=asset_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={"vehicle_id": asset.get("vehicle_id")},
    )
    return {"message": "Asset deleted successfully"}


# ============= SAFETY ROUTES =============
@api_router.post("/safety/incidents", response_model=SafetyIncident)
async def create_safety_incident(input: SafetyIncidentCreate):
    cost_usd = None
    if input.cost and input.currency:
        cost_usd = currency_converter.convert(input.cost, input.currency, CurrencyEnum.USD)
    
    incident_data = input.model_dump()
    incident_data['cost_usd'] = cost_usd
    incident = SafetyIncident(**incident_data)
    
    # Update driver safety score
    driver = await db.drivers.find_one({"id": input.driver_id}, {"_id": 0})
    if driver:
        severity_penalties = {"LOW": 2, "MEDIUM": 5, "HIGH": 10}
        penalty = severity_penalties.get(input.severity, 5)
        new_safety_score = max(0, driver.get('safety_score', 100) - penalty)
        new_incident_count = driver.get('total_incidents', 0) + 1
        
        await db.drivers.update_one(
            {"id": input.driver_id},
            {"$set": {
                "safety_score": new_safety_score,
                "total_incidents": new_incident_count,
                "updated_at": datetime.utcnow().isoformat()
            }}
        )
    
    doc = incident.model_dump()
    doc['incident_date'] = doc['incident_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.safety_incidents.insert_one(doc)
    return incident


@api_router.get("/safety/incidents", response_model=List[SafetyIncident])
async def get_safety_incidents(driver_id: Optional[str] = None, vehicle_id: Optional[str] = None):
    query = {}
    if driver_id:
        query['driver_id'] = driver_id
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    
    incidents = await db.safety_incidents.find(query, {"_id": 0}).to_list(1000)
    for i in incidents:
        if isinstance(i.get('incident_date'), str):
            i['incident_date'] = datetime.fromisoformat(i['incident_date'])
        if isinstance(i.get('created_at'), str):
            i['created_at'] = datetime.fromisoformat(i['created_at'])
    return incidents


@api_router.put("/safety/incidents/{incident_id}")
async def update_safety_incident(
    incident_id: str,
    input: SafetyIncidentUpdate,
    current_user: dict = Depends(_require_staff),
):
    update_data = input.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    existing = await db.safety_incidents.find_one({"id": incident_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Safety incident not found")

    if "cost" in update_data or "currency" in update_data:
        cost = update_data.get("cost", existing.get("cost"))
        currency = update_data.get("currency", existing.get("currency"))
        if cost and currency:
            update_data["cost_usd"] = currency_converter.convert(cost, currency, CurrencyEnum.USD)
        else:
            update_data["cost_usd"] = None

    update_data = _mongo_update_payload(update_data)
    await db.safety_incidents.update_one({"id": incident_id}, {"$set": update_data})
    return {"status": "success"}


@api_router.delete("/safety/incidents/{incident_id}")
async def delete_safety_incident(
    incident_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "safety_incident")
    incident = await db.safety_incidents.find_one({"id": incident_id}, {"_id": 0})
    if not incident:
        raise HTTPException(status_code=404, detail="Safety incident not found")

    await db.safety_incidents.delete_one({"id": incident_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="safety_incident",
        entity_id=incident_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={"incident_type": incident.get("incident_type"), "driver_id": incident.get("driver_id")},
    )
    return {"message": "Safety incident deleted successfully"}


# ============= EXCHANGE RATE ROUTES =============
@api_router.get("/exchange-rates/current")
async def get_current_rates():
    rates = {}
    for currency in [CurrencyEnum.GHS, CurrencyEnum.LRD, CurrencyEnum.STN]:
        rate = currency_converter.get_rate(currency, CurrencyEnum.USD)
        rates[currency.value] = rate
        
        # Store in database
        exchange_rate = ExchangeRate(
            from_currency=currency,
            to_currency=CurrencyEnum.USD,
            rate=rate
        )
        doc = exchange_rate.model_dump()
        doc['date'] = doc['date'].isoformat()
        await db.exchange_rates.insert_one(doc)
    
    return {"rates": rates, "base": "USD", "timestamp": datetime.utcnow().isoformat()}


@api_router.get("/exchange-rates/history")
async def get_exchange_rate_history(currency: str, days: int = 30):
    from_date = datetime.utcnow()
    
    rates = await db.exchange_rates.find(
        {"from_currency": currency},
        {"_id": 0}
    ).sort("date", -1).limit(days).to_list(days)
    
    for r in rates:
        if isinstance(r.get('date'), str):
            r['date'] = datetime.fromisoformat(r['date'])
    
    return rates


# ============= ROOT ROUTE =============
@api_router.get("/")
async def root():
    return {
        "message": "GTI Fleet Solutions API",
        "version": "3.0.0",
        "modules": [
            "Authentication", "Countries", "Vehicles", "Drivers", "Maintenance",
            "Workshops", "Inventory", "Fuel", "Expenditures",
            "Documents", "Assets", "Safety", "Exchange Rates",
            "Maintenance Requests", "Pre-Trip Checklists", "Fleet Managers",
            "Tires", "Driver Logbook", "Vendors", "Vehicle Locations",
            "Alerts", "TCO Reports", "Compliance"
        ]
    }


# ============= DASHBOARD/ANALYTICS ROUTES =============

# Helper function to get country filter for queries
PRIMARY_COUNTRIES = ("GH", "LR", "ST")


def get_country_filter(user_country: Optional[str]) -> dict:
    """Returns MongoDB filter based on user's country access (ISO or legacy)."""
    if user_country is None:  # Group Fleet Manager sees all
        return {}
    try:
        return country_filter_query(user_country)
    except ValueError:
        return {"country": user_country}


@api_router.get("/dashboard/stats")
async def get_dashboard_stats(country: Optional[str] = None):
    """Get dashboard statistics with optional country filter"""
    country_filter = country_filter_query(country) if country else {}
    
    total_vehicles = await db.vehicles.count_documents(country_filter)
    active_vehicles = await db.vehicles.count_documents({**country_filter, "status": "ACTIVE"})
    total_drivers = await db.drivers.count_documents(country_filter)
    pending_maintenance = await db.maintenance_records.count_documents({**country_filter, "completed_date": None})
    pending_requests = await db.maintenance_requests.count_documents({**country_filter, "status": "PENDING"})
    
    # Total fleet value
    assets = await db.assets.find(country_filter, {"_id": 0, "current_value_usd": 1}).to_list(1000)
    total_fleet_value = sum(a.get('current_value_usd', 0) for a in assets)
    
    # Monthly fuel cost
    fuel_txns = await db.fuel_transactions.find(country_filter, {"_id": 0, "cost_usd": 1}).to_list(1000)
    total_fuel_cost = sum(f.get('cost_usd', 0) for f in fuel_txns)
    
    # Total maintenance cost
    maintenance_records = await db.maintenance_records.find(country_filter, {"_id": 0, "cost": 1, "currency": 1, "cost_usd": 1}).to_list(1000)
    total_maintenance_cost_usd = sum(m.get('cost_usd', 0) for m in maintenance_records)
    
    # Convert to GHS using current rate
    ghs_rate = currency_converter.get_rate(CurrencyEnum.USD, CurrencyEnum.GHS)
    total_maintenance_cost_ghs = total_maintenance_cost_usd * ghs_rate
    
    # Count by country
    vehicles_by_country = {}
    drivers_by_country = {}
    for c in PRIMARY_COUNTRIES:
        q = country_filter_query(c)
        vehicles_by_country[c] = await db.vehicles.count_documents(q)
        drivers_by_country[c] = await db.drivers.count_documents(q)
    
    return {
        "total_vehicles": total_vehicles,
        "active_vehicles": active_vehicles,
        "total_drivers": total_drivers,
        "pending_maintenance": pending_maintenance,
        "pending_requests": pending_requests,
        "total_fleet_value_usd": round(total_fleet_value, 2),
        "total_fuel_cost_usd": round(total_fuel_cost, 2),
        "total_maintenance_cost_usd": round(total_maintenance_cost_usd, 2),
        "total_maintenance_cost_ghs": round(total_maintenance_cost_ghs, 2),
        "ghs_exchange_rate": round(ghs_rate, 2),
        "vehicles_by_country": vehicles_by_country,
        "drivers_by_country": drivers_by_country
    }


@api_router.get("/dashboard/personal")
async def get_personal_dashboard(current_user: dict = Depends(get_current_user)):
    """Get personalized dashboard stats for drivers/users"""
    user_id = current_user['id']
    driver_id = current_user.get('driver_id') or user_id
    
    # Get user's logbook entries (last 30 days)
    from_date = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    logbook_entries = await db.driver_logbook.find(
        {"driver_id": driver_id, "date": {"$gte": from_date}},
        {"_id": 0}
    ).to_list(100)
    
    total_trips = len(logbook_entries)
    total_distance = sum(e.get('distance_km', 0) for e in logbook_entries)
    total_fuel = sum(e.get('fuel_used_liters', 0) for e in logbook_entries)
    
    # Get user's maintenance requests
    my_requests = await db.maintenance_requests.find(
        {"driver_id": driver_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    pending_requests = len([r for r in my_requests if r.get('status') == 'PENDING'])
    approved_requests = len([r for r in my_requests if r.get('status') == 'APPROVED'])
    
    # Get today's pre-trip checklist status
    today = datetime.now(timezone.utc).date()
    start_of_day = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    today_checklist = await db.pretrip_checklists.find_one(
        {"driver_id": driver_id, "date": {"$gte": start_of_day.isoformat()}},
        {"_id": 0}
    )
    
    # Get assigned vehicle info
    assigned_vehicle = None
    if current_user.get('driver_id'):
        driver = await db.drivers.find_one({"id": current_user['driver_id']}, {"_id": 0})
        if driver and driver.get('assigned_vehicle_id'):
            assigned_vehicle = await db.vehicles.find_one(
                {"id": driver['assigned_vehicle_id']},
                {"_id": 0, "registration_number": 1, "make": 1, "model": 1, "status": 1}
            )
    
    # Speed violations count
    speed_violations = sum(e.get('speed_limit_violations', 0) for e in logbook_entries)
    
    return {
        "user_id": user_id,
        "driver_id": driver_id,
        "period_days": 30,
        "total_trips": total_trips,
        "total_distance_km": round(total_distance, 2),
        "total_fuel_liters": round(total_fuel, 2),
        "avg_fuel_efficiency": round(total_distance / total_fuel, 2) if total_fuel > 0 else 0,
        "pending_requests": pending_requests,
        "approved_requests": approved_requests,
        "total_requests": len(my_requests),
        "recent_requests": my_requests[:5],
        "today_checklist_completed": today_checklist is not None,
        "today_checklist_status": today_checklist.get('overall_status') if today_checklist else None,
        "assigned_vehicle": assigned_vehicle,
        "speed_violations": speed_violations
    }


@api_router.get("/dashboard/staff")
async def get_staff_dashboard(current_user: dict = Depends(get_current_user)):
    """Get dashboard stats for Fleet Managers and Fleet Officers (country-specific)"""
    user_role = current_user.get('role')
    user_country = current_user.get('country')
    
    # Normalize country for matching (handle different case formats)
    def normalize_country(country):
        if not country:
            return None
        try:
            return normalize_country_code(country)
        except ValueError:
            return None
    
    normalized_country = normalize_country(user_country)
    
    # Group Fleet Manager sees all, others see their country only
    if user_role == 'GROUP_FLEET_MANAGER':
        country_filter = {}
    else:
        country_filter = country_filter_query(normalized_country) if normalized_country else {"country": {"$exists": False}}
    
    # Basic stats
    total_vehicles = await db.vehicles.count_documents(country_filter)
    active_vehicles = await db.vehicles.count_documents({**country_filter, "status": "ACTIVE"})
    total_drivers = await db.drivers.count_documents(country_filter)
    pending_maintenance = await db.maintenance_records.count_documents({**country_filter, "completed_date": None})
    
    # Pending requests for this country
    request_filter = {} if user_role == 'GROUP_FLEET_MANAGER' else country_filter
    pending_requests = await db.maintenance_requests.find(
        {**request_filter, "status": "PENDING"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    
    # Pending user approvals based on role
    pending_users_query = {"is_approved": False}
    if user_role == 'GROUP_FLEET_MANAGER':
        pass  # See all
    elif user_role == 'FLEET_MANAGER':
        if normalized_country:
            pending_users_query['country'] = country_filter_query(normalized_country)['country']
        pending_users_query['role'] = {"$in": ['FLEET_OFFICER', 'DRIVER', 'USER']}
    elif user_role == 'FLEET_OFFICER':
        if normalized_country:
            pending_users_query['country'] = country_filter_query(normalized_country)['country']
        pending_users_query['role'] = {"$in": ['DRIVER', 'USER']}
    else:
        pending_users_query['id'] = 'NONE'  # No results
    
    pending_users = await db.users.find(
        pending_users_query, 
        {"_id": 0, "hashed_password": 0}
    ).to_list(50)
    
    # Financial totals
    assets = await db.assets.find(country_filter, {"_id": 0, "current_value_usd": 1}).to_list(1000)
    total_fleet_value = sum(a.get('current_value_usd', 0) for a in assets)
    
    fuel_txns = await db.fuel_transactions.find(country_filter, {"_id": 0, "cost_usd": 1}).to_list(1000)
    total_fuel_cost = sum(f.get('cost_usd', 0) for f in fuel_txns)
    
    maintenance_records = await db.maintenance_records.find(country_filter, {"_id": 0, "cost_usd": 1}).to_list(1000)
    total_maintenance_cost_usd = sum(m.get('cost_usd', 0) for m in maintenance_records)
    
    ghs_rate = currency_converter.get_rate(CurrencyEnum.USD, CurrencyEnum.GHS)
    
    # Recent activity in this country
    recent_logbook = await db.driver_logbook.find(
        country_filter, {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    
    # Count by country (for Group Manager)
    vehicles_by_country = {}
    drivers_by_country = {}
    if user_role == 'GROUP_FLEET_MANAGER':
        for c in PRIMARY_COUNTRIES:
            q = country_filter_query(c)
            vehicles_by_country[c] = await db.vehicles.count_documents(q)
            drivers_by_country[c] = await db.drivers.count_documents(q)
    
    return {
        "user_role": user_role,
        "user_country": user_country,
        "total_vehicles": total_vehicles,
        "active_vehicles": active_vehicles,
        "total_drivers": total_drivers,
        "pending_maintenance": pending_maintenance,
        "pending_requests_count": len(pending_requests),
        "pending_requests": pending_requests[:5],
        "pending_users_count": len(pending_users),
        "pending_users": pending_users[:10],
        "total_fleet_value_usd": round(total_fleet_value, 2),
        "total_fuel_cost_usd": round(total_fuel_cost, 2),
        "total_maintenance_cost_usd": round(total_maintenance_cost_usd, 2),
        "total_maintenance_cost_ghs": round(total_maintenance_cost_usd * ghs_rate, 2),
        "ghs_exchange_rate": round(ghs_rate, 2),
        "recent_activity": recent_logbook[:5],
        "vehicles_by_country": vehicles_by_country,
        "drivers_by_country": drivers_by_country
    }


@api_router.get("/dashboard/alerts")
async def get_dashboard_alerts(country: Optional[str] = None):
    """Get all active alerts for the dashboard"""
    country_filter = country_filter_query(country) if country else {}
    alerts = []
    now = datetime.now(timezone.utc)
    warning_threshold = now + timedelta(days=30)
    
    # 1. Document Expiry Alerts
    documents = await db.documents.find(country_filter, {"_id": 0}).to_list(1000)
    for doc in documents:
        expiry = doc.get('expiry_date')
        if expiry:
            if isinstance(expiry, str):
                expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
            
            days_until = (expiry - now).days
            if days_until < 0:
                alerts.append({
                    "type": "DOCUMENT_EXPIRY",
                    "severity": "CRITICAL",
                    "title": f"Expired: {doc.get('document_type', 'Document')}",
                    "message": f"Document expired {abs(days_until)} days ago",
                    "entity_type": "document",
                    "entity_id": doc.get('id'),
                    "country": doc.get('country'),
                    "days_until_expiry": days_until
                })
            elif days_until <= 30:
                alerts.append({
                    "type": "DOCUMENT_EXPIRY",
                    "severity": "WARNING",
                    "title": f"Expiring Soon: {doc.get('document_type', 'Document')}",
                    "message": f"Document expires in {days_until} days",
                    "entity_type": "document",
                    "entity_id": doc.get('id'),
                    "country": doc.get('country'),
                    "days_until_expiry": days_until
                })
    
    # 2. Fuel Anomalies
    fuel_txns = await db.fuel_transactions.find({**country_filter, "anomaly_detected": True}, {"_id": 0}).to_list(100)
    for txn in fuel_txns:
        vehicle = await db.vehicles.find_one({"id": txn.get('vehicle_id')}, {"_id": 0, "registration_number": 1})
        alerts.append({
            "type": "FUEL_ANOMALY",
            "severity": "WARNING",
            "title": "Fuel Anomaly Detected",
            "message": f"Unusual fuel consumption for {vehicle.get('registration_number', 'Unknown')}",
            "entity_type": "fuel_transaction",
            "entity_id": txn.get('id'),
            "country": txn.get('country')
        })
    
    # 3. Speeding Alerts (from logbook)
    speeding_entries = await db.driver_logbook.find(
        {**country_filter, "speed_limit_violations": {"$gt": 0}},
        {"_id": 0}
    ).sort("date", -1).limit(20).to_list(20)
    
    for entry in speeding_entries:
        driver = await db.drivers.find_one({"id": entry.get('driver_id')}, {"_id": 0, "first_name": 1, "last_name": 1})
        driver_name = f"{driver.get('first_name', '')} {driver.get('last_name', '')}" if driver else "Unknown"
        alerts.append({
            "type": "SPEEDING",
            "severity": "WARNING",
            "title": f"Speeding: {driver_name}",
            "message": f"{entry.get('speed_limit_violations', 0)} violations, max speed: {entry.get('max_speed_kmh', 0)} km/h",
            "entity_type": "logbook_entry",
            "entity_id": entry.get('id'),
            "country": entry.get('country')
        })
    
    # 4. Low Stock Alerts
    inventory = await db.inventory_items.find(country_filter, {"_id": 0}).to_list(1000)
    for item in inventory:
        if item.get('quantity', 0) <= item.get('reorder_level', 0):
            alerts.append({
                "type": "LOW_STOCK",
                "severity": "WARNING",
                "title": f"Low Stock: {item.get('name')}",
                "message": f"Current: {item.get('quantity')}, Reorder level: {item.get('reorder_level')}",
                "entity_type": "inventory",
                "entity_id": item.get('id'),
                "country": item.get('country')
            })
    
    # 5. Tire Alerts
    tires = await db.tires.find({**country_filter, "status": "IN_USE"}, {"_id": 0}).to_list(1000)
    for tire in tires:
        # Check tread depth
        if tire.get('tread_depth_mm') and tire.get('tread_depth_mm') <= tire.get('min_tread_depth', 1.6):
            alerts.append({
                "type": "TIRE_REPLACEMENT_DUE",
                "severity": "CRITICAL",
                "title": f"Tire Replacement Due: {tire.get('serial_number')}",
                "message": f"Tread depth {tire.get('tread_depth_mm')}mm below minimum {tire.get('min_tread_depth')}mm",
                "entity_type": "tire",
                "entity_id": tire.get('id'),
                "country": tire.get('country')
            })
        
        # Check rotation
        next_rotation = tire.get('next_rotation_due')
        if next_rotation:
            if isinstance(next_rotation, str):
                next_rotation = datetime.fromisoformat(next_rotation.replace('Z', '+00:00'))
            if next_rotation < now:
                alerts.append({
                    "type": "TIRE_ROTATION_DUE",
                    "severity": "WARNING",
                    "title": f"Tire Rotation Due: {tire.get('serial_number')}",
                    "message": "Rotation overdue",
                    "entity_type": "tire",
                    "entity_id": tire.get('id'),
                    "country": tire.get('country')
                })
    
    # 6. Pending Maintenance Requests
    pending_count = await db.maintenance_requests.count_documents({**country_filter, "status": "PENDING"})
    if pending_count > 0:
        alerts.append({
            "type": "MAINTENANCE_DUE",
            "severity": "INFO",
            "title": f"{pending_count} Pending Maintenance Requests",
            "message": "Maintenance requests awaiting approval",
            "entity_type": "maintenance_request",
            "entity_id": None,
            "country": country
        })
    
    # Sort by severity
    severity_order = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}
    alerts.sort(key=lambda x: severity_order.get(x['severity'], 3))
    
    return {
        "alerts": alerts,
        "total_count": len(alerts),
        "critical_count": len([a for a in alerts if a['severity'] == 'CRITICAL']),
        "warning_count": len([a for a in alerts if a['severity'] == 'WARNING']),
        "info_count": len([a for a in alerts if a['severity'] == 'INFO'])
    }


@api_router.get("/dashboard/compliance")
async def get_compliance_status(country: Optional[str] = None):
    """Get compliance status for all vehicles and drivers"""
    country_filter = country_filter_query(country) if country else {}
    now = datetime.now(timezone.utc)
    
    compliance_items = []
    
    # Check vehicle documents
    vehicles = await db.vehicles.find(country_filter, {"_id": 0}).to_list(1000)
    for vehicle in vehicles:
        vehicle_docs = await db.documents.find(
            {"vehicle_id": vehicle['id']},
            {"_id": 0}
        ).to_list(100)
        
        required_docs = ['ROADWORTHY_CERT', 'INSURANCE', 'VEHICLE_REGISTRATION']
        for doc_type in required_docs:
            doc = next((d for d in vehicle_docs if d.get('document_type') == doc_type), None)
            
            if not doc:
                compliance_items.append({
                    "entity_type": "vehicle",
                    "entity_id": vehicle['id'],
                    "entity_name": vehicle.get('registration_number'),
                    "country": vehicle.get('country'),
                    "check_type": doc_type,
                    "status": "NON_COMPLIANT",
                    "message": f"Missing {doc_type.replace('_', ' ').title()}"
                })
            else:
                expiry = doc.get('expiry_date')
                if expiry:
                    if isinstance(expiry, str):
                        expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
                    days_until = (expiry - now).days
                    
                    if days_until < 0:
                        status = "NON_COMPLIANT"
                        message = f"{doc_type.replace('_', ' ').title()} expired"
                    elif days_until <= 30:
                        status = "WARNING"
                        message = f"{doc_type.replace('_', ' ').title()} expires in {days_until} days"
                    else:
                        status = "COMPLIANT"
                        message = f"{doc_type.replace('_', ' ').title()} valid until {expiry.strftime('%Y-%m-%d')}"
                    
                    compliance_items.append({
                        "entity_type": "vehicle",
                        "entity_id": vehicle['id'],
                        "entity_name": vehicle.get('registration_number'),
                        "country": vehicle.get('country'),
                        "check_type": doc_type,
                        "status": status,
                        "message": message,
                        "expiry_date": expiry.isoformat() if expiry else None,
                        "days_until_expiry": days_until
                    })
    
    # Summary
    compliant = len([c for c in compliance_items if c['status'] == 'COMPLIANT'])
    warning = len([c for c in compliance_items if c['status'] == 'WARNING'])
    non_compliant = len([c for c in compliance_items if c['status'] == 'NON_COMPLIANT'])
    
    return {
        "items": compliance_items,
        "summary": {
            "compliant": compliant,
            "warning": warning,
            "non_compliant": non_compliant,
            "total": len(compliance_items),
            "compliance_rate": round((compliant / len(compliance_items) * 100) if compliance_items else 100, 1)
        }
    }


# ============= FLEET MANAGER ROUTES =============
@api_router.post("/fleet-managers", response_model=FleetManager)
async def create_fleet_manager(
    input: FleetManagerCreate, current_user: dict = Depends(get_current_user_validated)
):
    """Create a new fleet manager - only Group Fleet Manager and Fleet Manager can create"""
    user_role = current_user.get('role')
    
    # Only Group Fleet Manager and Fleet Manager can create Fleet Managers
    if user_role not in ['GROUP_FLEET_MANAGER', 'FLEET_MANAGER']:
        raise HTTPException(status_code=403, detail="Only Group Fleet Manager or Fleet Manager can add Fleet Managers")
    
    manager = FleetManager(**input.model_dump())
    doc = manager.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.fleet_managers.insert_one(doc)
    return manager


@api_router.get("/fleet-managers", response_model=List[FleetManager])
async def get_fleet_managers():
    managers = await db.fleet_managers.find({}, {"_id": 0}).to_list(100)
    for m in managers:
        if isinstance(m.get('created_at'), str):
            m['created_at'] = datetime.fromisoformat(m['created_at'])
    return managers


# ============= MAINTENANCE REQUEST ROUTES =============
@api_router.post("/maintenance-requests", response_model=MaintenanceRequest)
async def create_maintenance_request(input: MaintenanceRequestCreate, current_user: dict = Depends(get_current_user)):
    request = MaintenanceRequest(**input.model_dump())
    doc = request.model_dump()
    
    # Track who submitted this request (especially if on behalf of another driver)
    if input.driver_id != current_user.get('id') and input.driver_id != current_user.get('driver_id'):
        doc['submitted_by_id'] = current_user.get('id')
        doc['submitted_by_name'] = current_user.get('full_name')
        doc['submitted_by_role'] = current_user.get('role')
    
    # Add country from driver or input
    if input.country:
        doc['country'] = input.country
    else:
        driver = await db.drivers.find_one({"id": input.driver_id}, {"_id": 0, "country": 1})
        if driver:
            doc['country'] = driver.get('country')
        elif current_user.get('country'):
            doc['country'] = current_user.get('country')
    
    # Convert datetime fields
    for field in ['created_at', 'updated_at', 'approved_at', 'rejected_at', 'completed_at']:
        if doc.get(field):
            doc[field] = doc[field].isoformat()
    
    await db.maintenance_requests.insert_one(doc)
    
    # Get vehicle and driver info for notification
    vehicle = await db.vehicles.find_one({"id": input.vehicle_id}, {"_id": 0})
    driver_info = await db.drivers.find_one({"id": input.driver_id}, {"_id": 0})
    
    # Send email notification to all fleet managers
    managers = await db.fleet_managers.find({"is_active": True}, {"_id": 0}).to_list(100)
    for manager in managers:
        if manager.get('email'):
            email_service.send_maintenance_request_notification(
                manager['email'],
                {
                    'vehicle_registration': vehicle.get('registration_number', 'N/A') if vehicle else 'N/A',
                    'driver_name': f"{driver_info.get('first_name', '')} {driver_info.get('last_name', '')}" if driver_info else 'N/A',
                    'request_type': input.request_type,
                    'priority': input.priority.value,
                    'description': input.description
                }
            )
    
    # Return the document with submitted_by fields
    # Convert datetime strings back to datetime for Pydantic
    for field in ['created_at', 'updated_at', 'approved_at', 'rejected_at', 'completed_at']:
        if doc.get(field) and isinstance(doc[field], str):
            doc[field] = datetime.fromisoformat(doc[field])
    
    return doc


@api_router.get("/maintenance-requests", response_model=List[MaintenanceRequest])
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


@api_router.get("/maintenance-requests/{request_id}", response_model=MaintenanceRequest)
async def get_maintenance_request(request_id: str):
    request = await db.maintenance_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    for field in ['created_at', 'updated_at', 'approved_at', 'rejected_at', 'completed_at']:
        if isinstance(request.get(field), str):
            request[field] = datetime.fromisoformat(request[field])
    return request


@api_router.put("/maintenance-requests/{request_id}", response_model=MaintenanceRequest)
async def update_maintenance_request(
    request_id: str,
    input: MaintenanceRequestUpdate,
    current_user: dict = Depends(get_current_user),
):
    request = await db.maintenance_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    if request.get("status") != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be edited")

    role = current_user.get("role")
    user_id = current_user.get("id")
    driver_id = current_user.get("driver_id")
    is_staff = role in _STAFF_ROLES
    is_owner = request.get("driver_id") in (user_id, driver_id)
    if not is_staff and not is_owner:
        raise HTTPException(status_code=403, detail="You cannot edit this request")

    update_data = _mongo_update_payload({k: v for k, v in input.model_dump().items() if v is not None})
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.maintenance_requests.update_one({"id": request_id}, {"$set": update_data})
    updated = await db.maintenance_requests.find_one({"id": request_id}, {"_id": 0})
    for field in ["created_at", "updated_at", "approved_at", "rejected_at", "completed_at"]:
        if isinstance(updated.get(field), str):
            updated[field] = datetime.fromisoformat(updated[field])
    return updated


@api_router.delete("/maintenance-requests/{request_id}")
async def delete_maintenance_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "maintenance_request")
    request = await db.maintenance_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    await db.maintenance_requests.delete_one({"id": request_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="maintenance_request",
        entity_id=request_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={
            "request_type": request.get("request_type"),
            "vehicle_id": request.get("vehicle_id"),
            "status": request.get("status"),
        },
    )
    return {"message": "Maintenance request deleted successfully"}


@api_router.post("/maintenance-requests/{request_id}/approve")
async def approve_maintenance_request(
    request_id: str,
    approval: MaintenanceRequestApproval,
    current_user: dict = Depends(get_current_user_validated),
):
    """Approve or reject a maintenance request - auto-fills approving manager"""
    request = await db.maintenance_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request['status'] != 'PENDING':
        raise HTTPException(status_code=400, detail="Request is not pending")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Auto-fill the approving manager with current user
    approving_manager_id = current_user.get('id')
    approving_manager_name = current_user.get('full_name')
    approving_manager_role = current_user.get('role')
    
    if approval.approved:
        update = {
            "status": "APPROVED",
            "manager_id": approval.manager_id or approving_manager_id,
            "approved_by_id": approving_manager_id,
            "approved_by_name": approving_manager_name,
            "approved_by_role": approving_manager_role,
            "approved_at": now,
            "updated_at": now
        }
    else:
        if not approval.rejection_reason:
            raise HTTPException(status_code=400, detail="Rejection reason is required")
        update = {
            "status": "REJECTED",
            "manager_id": approval.manager_id or approving_manager_id,
            "rejected_by_id": approving_manager_id,
            "rejected_by_name": approving_manager_name,
            "rejected_by_role": approving_manager_role,
            "rejection_reason": approval.rejection_reason,
            "rejected_at": now,
            "updated_at": now
        }
    
    await db.maintenance_requests.update_one({"id": request_id}, {"$set": update})
    
    # Send notification to driver
    driver = await db.drivers.find_one({"id": request['driver_id']}, {"_id": 0})
    vehicle = await db.vehicles.find_one({"id": request['vehicle_id']}, {"_id": 0})
    
    if driver and driver.get('email'):
        email_service.send_request_status_notification(
            driver['email'],
            {
                'vehicle_registration': vehicle.get('registration_number', 'N/A') if vehicle else 'N/A',
                'request_type': request.get('request_type', 'N/A')
            },
            "APPROVED" if approval.approved else "REJECTED",
            approval.rejection_reason
        )
    
    return {"status": "success", "message": f"Request {'approved' if approval.approved else 'rejected'}"}


# ============= PRE-TRIP CHECKLIST ROUTES =============
@api_router.post("/pre-trip-checklists", response_model=PreTripChecklist)
async def create_pretrip_checklist(input: PreTripChecklistCreate, current_user: dict = Depends(get_current_user)):
    # Check if checklist already exists for today
    today = datetime.now(timezone.utc).date()
    existing = await db.pretrip_checklists.find_one({
        "driver_id": input.driver_id,
        "vehicle_id": input.vehicle_id,
        "date": {"$gte": datetime(today.year, today.month, today.day).isoformat()}
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(status_code=400, detail="Checklist already completed for today")
    
    fields = input.model_dump()
    items, overall_status = _pretrip_build_items_and_status(fields)
    
    checklist = PreTripChecklist(
        driver_id=input.driver_id,
        vehicle_id=input.vehicle_id,
        date=datetime.now(timezone.utc),
        checklist_items=items,
        damage_photos=input.damage_photos,
        overall_status=overall_status,
        completed=True,
        notes=input.additional_notes
    )
    
    doc = checklist.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    
    # Track who submitted this checklist (especially if on behalf of another driver)
    if input.driver_id != current_user.get('id') and input.driver_id != current_user.get('driver_id'):
        doc['submitted_by_id'] = current_user.get('id')
        doc['submitted_by_name'] = current_user.get('full_name')
        doc['submitted_by_role'] = current_user.get('role')
    
    await db.pretrip_checklists.insert_one(doc)
    return checklist


@api_router.get("/pre-trip-checklists", response_model=List[PreTripChecklist])
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


@api_router.put("/pre-trip-checklists/{checklist_id}")
async def update_pretrip_checklist(
    checklist_id: str,
    input: PreTripChecklistUpdate,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.pretrip_checklists.find_one({"id": checklist_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Checklist not found")

    _assert_can_edit_pretrip(current_user, existing)

    update_data = input.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    merged = _pretrip_doc_to_fields(existing)
    merged.update(update_data)

    items, overall_status = _pretrip_build_items_and_status(merged)
    set_payload = {
        "driver_id": merged.get("driver_id", existing.get("driver_id")),
        "vehicle_id": merged.get("vehicle_id", existing.get("vehicle_id")),
        "checklist_items": items,
        "overall_status": overall_status,
        "completed": True,
        "notes": merged.get("additional_notes"),
        "damage_photos": merged.get("damage_photos", existing.get("damage_photos") or []),
    }

    await db.pretrip_checklists.update_one({"id": checklist_id}, {"$set": set_payload})
    return {"status": "success"}


@api_router.delete("/pre-trip-checklists/{checklist_id}")
async def delete_pretrip_checklist(
    checklist_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "pretrip_checklist")
    checklist = await db.pretrip_checklists.find_one({"id": checklist_id}, {"_id": 0})
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")

    await db.pretrip_checklists.delete_one({"id": checklist_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="pretrip_checklist",
        entity_id=checklist_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={
            "driver_id": checklist.get("driver_id"),
            "vehicle_id": checklist.get("vehicle_id"),
            "overall_status": checklist.get("overall_status"),
        },
    )
    return {"message": "Checklist deleted successfully"}


@api_router.get("/pre-trip-checklists/today/{driver_id}/{vehicle_id}")
async def check_today_checklist(driver_id: str, vehicle_id: str):
    """Check if driver has completed today's checklist for the vehicle"""
    today = datetime.now(timezone.utc).date()
    start_of_day = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    
    existing = await db.pretrip_checklists.find_one({
        "driver_id": driver_id,
        "vehicle_id": vehicle_id,
        "date": {"$gte": start_of_day.isoformat()}
    }, {"_id": 0})
    
    return {
        "completed": existing is not None,
        "checklist": existing,
        "can_log_trips": existing is not None and existing.get('overall_status') != 'FAILED'
    }


# Max upload size for damage photos (bytes)
_DAMAGE_PHOTO_MAX_BYTES = 5 * 1024 * 1024
_ALLOWED_IMAGE_CONTENT_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif"}
)


@api_router.post("/pre-trip-checklists/upload-photo")
async def upload_damage_photo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a damage photo (authenticated; size and image type validated)."""
    ct = (file.content_type or "").split(";")[0].strip().lower()
    if ct not in _ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(sorted(_ALLOWED_IMAGE_CONTENT_TYPES))}",
        )
    content = await file.read()
    if len(content) > _DAMAGE_PHOTO_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large (max {_DAMAGE_PHOTO_MAX_BYTES // (1024 * 1024)} MB)",
        )

    photo_id = str(uuid.uuid4())
    photo_doc = {
        "id": photo_id,
        "filename": file.filename,
        "content_type": ct,
        "uploaded_by": current_user.get("id"),
        "data": base64.b64encode(content).decode("utf-8"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.damage_photos.insert_one(photo_doc)

    return {
        "photo_id": photo_id,
        "url": f"/api/damage-photos/{photo_id}",
        "message": "Photo uploaded successfully",
    }


@api_router.get("/damage-photos/{photo_id}")
async def get_damage_photo(photo_id: str, current_user: dict = Depends(get_current_user)):
    """Get a damage photo by ID (authenticated)."""
    photo = await db.damage_photos.find_one({"id": photo_id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    content = base64.b64decode(photo["data"])
    return Response(content=content, media_type=photo.get("content_type", "image/jpeg"))


# ============= AUTHENTICATION ROUTES =============
@api_router.post("/auth/register", status_code=201)
@limiter.limit("10/minute")
async def register_user(request: Request, input: UserSelfRegister):
    """Public self-registration (USER, DRIVER, FLEET_MANAGER, FLEET_OFFICER). No JWT until a manager approves."""
    existing = await db.users.find_one({"email": input.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=input.email,
        hashed_password=get_password_hash(input.password),
        full_name=input.full_name,
        role=input.role,
        country=input.country,
        driver_id=input.driver_id,
        is_approved=False,
    )

    doc = user.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if doc.get("last_login"):
        doc["last_login"] = doc["last_login"].isoformat()

    await db.users.insert_one(doc)

    return {
        "status": "pending_approval",
        "message": "Registration successful. An authorized manager must approve your account before you can log in.",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "country": user.country if user.country else None,
            "is_approved": False,
        },
    }


@api_router.post("/auth/bootstrap", response_model=Token)
@limiter.limit("5/minute")
async def bootstrap_group_fleet_manager(
    request: Request,
    input: BootstrapGroupFleetManagerRequest,
    x_bootstrap_token: Optional[str] = Header(None, alias="X-Bootstrap-Token"),
):
    """
    One-time creation of the first Group Fleet Manager when no GFM exists.
    Requires BOOTSTRAP_TOKEN env var and matching X-Bootstrap-Token header.
    """
    expected = os.environ.get("BOOTSTRAP_TOKEN", "").strip()
    if not expected or not x_bootstrap_token or x_bootstrap_token != expected:
        raise HTTPException(status_code=404, detail="Not found")

    existing_gfm = await db.users.find_one({"role": "GROUP_FLEET_MANAGER"})
    if existing_gfm:
        raise HTTPException(
            status_code=400,
            detail="A Group Fleet Manager already exists. Bootstrap is disabled.",
        )

    existing_email = await db.users.find_one({"email": input.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=input.email,
        hashed_password=get_password_hash(input.password),
        full_name=input.full_name,
        role=UserRole.GROUP_FLEET_MANAGER,
        country=None,
        is_approved=True,
    )
    doc = user.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.users.insert_one(doc)

    access_token = create_access_token(
        data=access_token_payload_from_user_record(user.model_dump())
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "country": None,
            "is_approved": True,
        },
    )


@api_router.post("/auth/login")
@limiter.limit("30/minute")
async def login(request: Request, input: UserLogin):
    """Login and get access token"""
    user = await db.users.find_one({"email": input.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(input.password, user['hashed_password']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not user.get('is_active', True):
        raise HTTPException(status_code=403, detail="Account is deactivated")
    
    if user.get("role") != "GROUP_FLEET_MANAGER" and not user.get("is_approved", False):
        raise HTTPException(status_code=403, detail="Account pending approval by Group Fleet Manager")

    # Check if user is Group Fleet Manager - require OTP verification
    if user['role'] == 'GROUP_FLEET_MANAGER':
        # Return a response indicating OTP is required
        return {
            "requires_otp": True,
            "email": user['email'],
            "message": "OTP verification required for Group Fleet Manager login"
        }
    
    # Update last login
    await db.users.update_one(
        {"id": user['id']},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    access_token = create_access_token(
        data=access_token_payload_from_user_record(user)
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user={
            "id": user['id'],
            "email": user['email'],
            "full_name": user['full_name'],
            "role": user['role'],
            "country": user.get('country'),
            "is_approved": user.get('is_approved', False)
        }
    )


@api_router.post("/auth/send-otp")
@limiter.limit("10/minute")
async def send_otp(request: Request, input: UserLogin):
    """Send OTP to Group Fleet Manager email for verification"""
    user = await db.users.find_one({"email": input.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(input.password, user['hashed_password']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if user['role'] != 'GROUP_FLEET_MANAGER':
        raise HTTPException(status_code=400, detail="OTP verification only required for Group Fleet Manager")
    
    # Generate 6-digit OTP
    import random
    otp_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    
    # Store OTP with expiry (5 minutes)
    otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    await db.otp_codes.update_one(
        {"email": input.email},
        {"$set": {
            "email": input.email,
            "otp": otp_code,
            "expires_at": otp_expiry.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    # Send OTP via email
    email_service.send_otp_email(user['email'], user['full_name'], otp_code)
    
    return {"message": "OTP sent to your email", "email": user['email']}


@api_router.post("/auth/verify-otp")
@limiter.limit("30/minute")
async def verify_otp(request: Request, email: str = Body(...), otp: str = Body(...)):
    """Verify OTP and complete Group Fleet Manager login"""
    # Find OTP record
    otp_record = await db.otp_codes.find_one({"email": email}, {"_id": 0})
    if not otp_record:
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new one.")
    
    # Check expiry
    expiry = datetime.fromisoformat(otp_record['expires_at'])
    if datetime.now(timezone.utc) > expiry:
        await db.otp_codes.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    
    # Verify OTP
    if otp_record['otp'] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Delete used OTP
    await db.otp_codes.delete_one({"email": email})
    
    # Get user and complete login
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Update last login
    await db.users.update_one(
        {"id": user['id']},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    access_token = create_access_token(
        data=access_token_payload_from_user_record(user)
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user={
            "id": user['id'],
            "email": user['email'],
            "full_name": user['full_name'],
            "role": user['role'],
            "country": user.get('country'),
            "is_approved": user.get('is_approved', False)
        }
    )


@api_router.get("/auth/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@api_router.get("/auth/users")
async def get_all_users(current_user: dict = Depends(require_group_manager())):
    """Get all users (Group Fleet Manager only)"""
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(1000)
    for u in users:
        for field in ['created_at', 'last_login']:
            if isinstance(u.get(field), str):
                u[field] = datetime.fromisoformat(u[field])
    return users


@api_router.put("/auth/users/{user_id}/approve")
async def approve_user(user_id: str, current_user: dict = Depends(get_current_user_validated)):
    """Approve a user based on role hierarchy and country"""
    # Get the user to be approved
    user_to_approve = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_to_approve:
        raise HTTPException(status_code=404, detail="User not found")
    
    approver_role = current_user.get('role')
    approver_country = current_user.get('country')
    user_role = user_to_approve.get('role')
    user_country = user_to_approve.get('country')
    
    # Define approval permissions
    can_approve = False
    
    if approver_role == 'GROUP_FLEET_MANAGER':
        # Group Manager can approve anyone
        can_approve = True
    elif approver_role == 'FLEET_MANAGER':
        # Fleet Manager can approve Fleet Officers, Drivers, Users in their country
        if user_role in ['FLEET_OFFICER', 'DRIVER', 'USER'] and user_country == approver_country:
            can_approve = True
    elif approver_role == 'FLEET_OFFICER':
        # Fleet Officer can approve Drivers and Users in their country
        if user_role in ['DRIVER', 'USER'] and user_country == approver_country:
            can_approve = True
    
    if not can_approve:
        raise HTTPException(
            status_code=403, 
            detail=f"You don't have permission to approve {user_role.replace('_', ' ').title()} accounts"
        )
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_approved": True,
            "approved_by": current_user.get('id')
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"status": "success", "message": f"User approved by {current_user.get('full_name')}"}


@api_router.get("/auth/users/pending")
async def get_pending_users(current_user: dict = Depends(get_current_user)):
    """Get pending users that current user can approve"""
    approver_role = current_user.get('role')
    approver_country = current_user.get('country')
    
    # Build filter based on role
    query = {"is_approved": False}
    
    if approver_role == 'GROUP_FLEET_MANAGER':
        # Can see all pending users
        pass
    elif approver_role == 'FLEET_MANAGER':
        # Can see Fleet Officers, Drivers, Users in their country
        query['country'] = approver_country
        query['role'] = {"$in": ['FLEET_OFFICER', 'DRIVER', 'USER']}
    elif approver_role == 'FLEET_OFFICER':
        # Can see Drivers and Users in their country
        query['country'] = approver_country
        query['role'] = {"$in": ['DRIVER', 'USER']}
    else:
        # Drivers/Users cannot approve anyone
        return []
    
    users = await db.users.find(query, {"_id": 0, "hashed_password": 0}).to_list(100)
    return users


@api_router.put("/auth/users/{user_id}")
async def update_user(user_id: str, input: UserUpdate, current_user: dict = Depends(require_group_manager())):
    """Update a user (Group Fleet Manager only)"""
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "success", "message": "User updated"}


@api_router.post("/auth/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, input: ForgotPasswordRequest):
    """Request a password reset token"""
    user = await db.users.find_one({"email": input.email}, {"_id": 0})
    
    # Always return success to prevent email enumeration
    if not user:
        return {"status": "success", "message": "If an account with that email exists, a reset link will be sent."}
    
    # Generate reset token
    import secrets
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    
    # Store reset token
    token_doc = PasswordResetToken(
        user_id=user['id'],
        token=reset_token,
        email=input.email,
        expires_at=expires_at
    )
    doc = token_doc.model_dump()
    doc['expires_at'] = doc['expires_at'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.password_reset_tokens.insert_one(doc)
    
    # Send email with reset link (if Resend is configured)
    reset_link = f"{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token={reset_token}"
    email_service.send_password_reset_email(input.email, reset_link, user.get('full_name', 'User'))
    
    return {"status": "success", "message": "If an account with that email exists, a reset link will be sent."}


@api_router.post("/auth/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, input: ResetPasswordRequest):
    """Reset password using a reset token"""
    # Find valid token
    token_doc = await db.password_reset_tokens.find_one({
        "token": input.token,
        "used": False
    }, {"_id": 0})
    
    if not token_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Check if token is expired
    expires_at = token_doc.get('expires_at')
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired")
    
    hashed_password = get_password_hash(input.new_password)
    current = await db.users.find_one(
        {"id": token_doc['user_id']},
        {"_id": 0, "token_version": 1},
    )
    next_tv = int(current.get("token_version", 0)) + 1 if current else 1
    result = await db.users.update_one(
        {"id": token_doc['user_id']},
        {"$set": {"hashed_password": hashed_password, "token_version": next_tv}},
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Mark token as used
    await db.password_reset_tokens.update_one(
        {"token": input.token},
        {"$set": {"used": True}}
    )
    
    return {"status": "success", "message": "Password reset successfully"}


@api_router.get("/auth/verify-reset-token/{token}")
async def verify_reset_token(token: str):
    """Verify if a reset token is valid"""
    token_doc = await db.password_reset_tokens.find_one({
        "token": token,
        "used": False
    }, {"_id": 0})
    
    if not token_doc:
        return {"valid": False, "message": "Invalid reset token"}
    
    # Check if token is expired
    expires_at = token_doc.get('expires_at')
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
    
    if expires_at < datetime.now(timezone.utc):
        return {"valid": False, "message": "Reset token has expired"}
    
    return {"valid": True, "email": token_doc.get('email')}


# ============= TIRE MANAGEMENT ROUTES =============
@api_router.post("/tires", response_model=Tire)
async def create_tire(input: TireCreate):
    """Create a new tire"""
    tire = Tire(**input.model_dump())
    doc = tire.model_dump()
    
    for field in ['purchase_date', 'last_rotation_date', 'next_rotation_due', 'created_at', 'updated_at']:
        if doc.get(field):
            doc[field] = doc[field].isoformat()
    
    await db.tires.insert_one(doc)
    return tire


@api_router.get("/tires")
async def get_tires(country: Optional[str] = None, vehicle_id: Optional[str] = None, status: Optional[str] = None):
    """Get all tires with optional filters"""
    query = {}
    if country:
        query['country'] = country
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    if status:
        query['status'] = status
    
    tires = await db.tires.find(query, {"_id": 0}).to_list(1000)
    for t in tires:
        for field in ['purchase_date', 'last_rotation_date', 'next_rotation_due', 'created_at', 'updated_at']:
            if isinstance(t.get(field), str):
                t[field] = datetime.fromisoformat(t[field])
    return tires


@api_router.get("/tires/{tire_id}")
async def get_tire(tire_id: str):
    """Get a single tire"""
    tire = await db.tires.find_one({"id": tire_id}, {"_id": 0})
    if not tire:
        raise HTTPException(status_code=404, detail="Tire not found")
    return tire


@api_router.put("/tires/{tire_id}")
async def update_tire(
    tire_id: str,
    input: TireUpdate,
    current_user: dict = Depends(_require_staff),
):
    """Update a tire"""
    update_data = input.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data = _mongo_update_payload(update_data)
    result = await db.tires.update_one({"id": tire_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tire not found")
    return {"status": "success"}


@api_router.delete("/tires/{tire_id}")
async def delete_tire(
    tire_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "tire")
    tire = await db.tires.find_one({"id": tire_id}, {"_id": 0})
    if not tire:
        raise HTTPException(status_code=404, detail="Tire not found")

    await db.tires.delete_one({"id": tire_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="tire",
        entity_id=tire_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={"serial_number": tire.get("serial_number")},
    )
    return {"message": "Tire deleted successfully"}


@api_router.post("/tires/rotations", response_model=TireRotation)
async def record_tire_rotation(input: TireRotationCreate):
    """Record a tire rotation"""
    rotation = TireRotation(**input.model_dump())
    doc = rotation.model_dump()
    
    for field in ['rotation_date', 'created_at']:
        if doc.get(field):
            doc[field] = doc[field].isoformat()
    
    await db.tire_rotations.insert_one(doc)
    
    # Update tire positions and next rotation dates
    for rot in input.rotations:
        next_rotation = datetime.now(timezone.utc) + timedelta(days=90)  # 3 months
        await db.tires.update_one(
            {"id": rot['tire_id']},
            {"$set": {
                "position": rot['to_position'],
                "last_rotation_date": datetime.now(timezone.utc).isoformat(),
                "next_rotation_due": next_rotation.isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return rotation


@api_router.get("/tires/rotations/history")
async def get_tire_rotation_history(vehicle_id: Optional[str] = None):
    """Get tire rotation history"""
    query = {}
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    
    rotations = await db.tire_rotations.find(query, {"_id": 0}).sort("rotation_date", -1).to_list(100)
    return rotations


# ============= DRIVER LOGBOOK ROUTES =============
@api_router.post("/logbook", response_model=LogbookEntry)
async def create_logbook_entry(input: LogbookEntryCreate, current_user: dict = Depends(get_current_user)):
    """Create a new logbook entry"""
    entry_data = input.model_dump()
    
    # Get country from driver if not provided
    if not entry_data.get('country'):
        driver = await db.drivers.find_one({"id": input.driver_id}, {"_id": 0, "country": 1})
        if driver:
            entry_data['country'] = driver.get('country')
        elif current_user.get('country'):
            entry_data['country'] = current_user.get('country')
    
    entry = LogbookEntry(**entry_data)
    
    # Calculate distance if not provided
    if input.end_odometer and not entry.distance_km:
        entry.distance_km = input.end_odometer - input.start_odometer
    
    doc = entry.model_dump()
    
    # Track who submitted this entry (especially if on behalf of another driver)
    if input.driver_id != current_user.get('id') and input.driver_id != current_user.get('driver_id'):
        doc['submitted_by_id'] = current_user.get('id')
        doc['submitted_by_name'] = current_user.get('full_name')
        doc['submitted_by_role'] = current_user.get('role')
    
    for field in ['date', 'start_time', 'end_time', 'created_at']:
        if doc.get(field):
            doc[field] = doc[field].isoformat()
    
    await db.driver_logbook.insert_one(doc)
    return doc


@api_router.get("/logbook")
async def get_logbook_entries(
    driver_id: Optional[str] = None,
    vehicle_id: Optional[str] = None,
    country: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get logbook entries with filters"""
    query = {}
    if driver_id:
        query['driver_id'] = driver_id
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    if country:
        query['country'] = country
    if start_date:
        query['date'] = {"$gte": start_date}
    if end_date:
        if 'date' in query:
            query['date']['$lte'] = end_date
        else:
            query['date'] = {"$lte": end_date}
    
    entries = await db.driver_logbook.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    for e in entries:
        for field in ['date', 'start_time', 'end_time', 'created_at']:
            if isinstance(e.get(field), str):
                e[field] = datetime.fromisoformat(e[field])
    return entries


@api_router.put("/logbook/{entry_id}", response_model=LogbookEntry)
async def update_logbook_entry(
    entry_id: str,
    input: LogbookEntryUpdate,
    current_user: dict = Depends(get_current_user),
):
    entry = await db.driver_logbook.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Logbook entry not found")

    role = current_user.get("role")
    user_id = current_user.get("id")
    driver_id = current_user.get("driver_id")
    is_staff = role in _STAFF_ROLES
    is_owner = entry.get("driver_id") in (user_id, driver_id)
    if not is_staff and not is_owner:
        raise HTTPException(status_code=403, detail="You cannot edit this logbook entry")

    update_data = _mongo_update_payload({k: v for k, v in input.model_dump().items() if v is not None})
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    start_odo = update_data.get("start_odometer", entry.get("start_odometer"))
    end_odo = update_data.get("end_odometer", entry.get("end_odometer"))
    if end_odo is not None and start_odo is not None:
        update_data["distance_km"] = end_odo - start_odo

    await db.driver_logbook.update_one({"id": entry_id}, {"$set": update_data})
    updated = await db.driver_logbook.find_one({"id": entry_id}, {"_id": 0})
    for field in ["date", "start_time", "end_time", "created_at"]:
        if isinstance(updated.get(field), str):
            updated[field] = datetime.fromisoformat(updated[field])
    return updated


@api_router.delete("/logbook/{entry_id}")
async def delete_logbook_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "logbook_entry")
    entry = await db.driver_logbook.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Logbook entry not found")

    await db.driver_logbook.delete_one({"id": entry_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="logbook_entry",
        entity_id=entry_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={
            "driver_id": entry.get("driver_id"),
            "vehicle_id": entry.get("vehicle_id"),
            "purpose": entry.get("purpose"),
        },
    )
    return {"message": "Logbook entry deleted successfully"}


@api_router.get("/logbook/summary/{driver_id}")
async def get_driver_logbook_summary(driver_id: str, period_days: int = 30):
    """Get driver logbook summary"""
    start_date = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    
    entries = await db.driver_logbook.find(
        {"driver_id": driver_id, "date": {"$gte": start_date}},
        {"_id": 0}
    ).to_list(1000)
    
    total_distance = sum(e.get('distance_km', 0) for e in entries)
    total_trips = len(entries)
    total_violations = sum(e.get('speed_limit_violations', 0) for e in entries)
    total_fuel = sum(e.get('fuel_used_liters', 0) for e in entries)
    
    return {
        "driver_id": driver_id,
        "period_days": period_days,
        "total_trips": total_trips,
        "total_distance_km": round(total_distance, 2),
        "total_fuel_liters": round(total_fuel, 2),
        "avg_fuel_efficiency": round(total_distance / total_fuel, 2) if total_fuel > 0 else 0,
        "speed_violations": total_violations,
        "harsh_braking_events": sum(e.get('harsh_braking_events', 0) for e in entries),
        "harsh_acceleration_events": sum(e.get('harsh_acceleration_events', 0) for e in entries)
    }


# ============= VENDOR MANAGEMENT ROUTES =============
@api_router.post("/vendors", response_model=Vendor)
async def create_vendor(input: VendorCreate):
    """Create a new vendor"""
    vendor = Vendor(**input.model_dump())
    doc = vendor.model_dump()
    
    for field in ['created_at', 'updated_at']:
        if doc.get(field):
            doc[field] = doc[field].isoformat()
    
    await db.vendors.insert_one(doc)
    return vendor


@api_router.get("/vendors")
async def get_vendors(country: Optional[str] = None, category: Optional[str] = None):
    """Get all vendors with optional filters"""
    query = {}
    if country:
        query['country'] = country
    if category:
        query['category'] = category
    
    vendors = await db.vendors.find(query, {"_id": 0}).to_list(1000)
    for v in vendors:
        for field in ['created_at', 'updated_at']:
            if isinstance(v.get(field), str):
                v[field] = datetime.fromisoformat(v[field])
    return vendors


@api_router.get("/vendors/{vendor_id}")
async def get_vendor(vendor_id: str):
    """Get a single vendor"""
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


@api_router.put("/vendors/{vendor_id}")
async def update_vendor(
    vendor_id: str,
    input: VendorUpdate,
    current_user: dict = Depends(_require_staff),
):
    """Update a vendor"""
    update_data = input.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data = _mongo_update_payload(update_data)
    result = await db.vendors.update_one({"id": vendor_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return {"status": "success"}


@api_router.delete("/vendors/{vendor_id}")
async def delete_vendor(
    vendor_id: str,
    current_user: dict = Depends(get_current_user),
):
    assert_can_hard_delete(current_user, "vendor")
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    await db.vendors.delete_one({"id": vendor_id})
    await write_audit_log(
        action="hard_delete",
        entity_type="vendor",
        entity_id=vendor_id,
        actor_id=current_user["id"],
        actor_role=current_user.get("role", ""),
        actor_email=current_user.get("email"),
        details={"name": vendor.get("name"), "category": vendor.get("category")},
    )
    return {"message": "Vendor deleted successfully"}


# ============= VEHICLE LOCATION ROUTES =============
@api_router.post("/vehicle-locations", response_model=VehicleLocation)
async def create_vehicle_location(input: VehicleLocationCreate):
    """Update vehicle location (GPS or Manual)"""
    location = VehicleLocation(**input.model_dump())
    doc = location.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    await db.vehicle_locations.insert_one(doc)
    
    # Update vehicle's last known location
    await db.vehicles.update_one(
        {"id": input.vehicle_id},
        {"$set": {
            "last_location": {
                "latitude": input.latitude,
                "longitude": input.longitude,
                "address": input.address,
                "timestamp": doc['timestamp']
            }
        }}
    )
    
    return location


@api_router.get("/vehicle-locations")
async def get_vehicle_locations(country: Optional[str] = None):
    """Get latest location for all vehicles"""
    query = {}
    if country:
        query['country'] = country
    
    # Get vehicles with their last locations
    vehicles = await db.vehicles.find(query, {"_id": 0}).to_list(1000)
    locations = []
    
    for vehicle in vehicles:
        last_loc = vehicle.get('last_location')
        if last_loc:
            locations.append({
                "vehicle_id": vehicle['id'],
                "registration_number": vehicle.get('registration_number'),
                "make": vehicle.get('make'),
                "model": vehicle.get('model'),
                "country": vehicle.get('country'),
                "status": vehicle.get('status'),
                **last_loc
            })
    
    return locations


@api_router.get("/vehicle-locations/{vehicle_id}/history")
async def get_vehicle_location_history(vehicle_id: str, hours: int = 24):
    """Get location history for a vehicle"""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    locations = await db.vehicle_locations.find(
        {"vehicle_id": vehicle_id, "timestamp": {"$gte": since}},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(1000)
    
    return locations


# ============= TCO (TOTAL COST OF OWNERSHIP) ROUTES =============
@api_router.get("/tco/vehicle/{vehicle_id}")
async def get_vehicle_tco(vehicle_id: str, period_days: int = 365):
    """Calculate TCO for a specific vehicle"""
    start_date = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    # Fuel costs
    fuel_txns = await db.fuel_transactions.find(
        {"vehicle_id": vehicle_id, "date": {"$gte": start_date}},
        {"_id": 0, "cost_usd": 1, "quantity_liters": 1}
    ).to_list(1000)
    fuel_cost = sum(f.get('cost_usd', 0) for f in fuel_txns)
    total_fuel = sum(f.get('quantity_liters', 0) for f in fuel_txns)
    
    # Maintenance costs
    maintenance = await db.maintenance_records.find(
        {"vehicle_id": vehicle_id, "date": {"$gte": start_date}},
        {"_id": 0, "cost_usd": 1}
    ).to_list(1000)
    maintenance_cost = sum(m.get('cost_usd', 0) for m in maintenance)
    
    # Tire costs
    tires = await db.tires.find(
        {"vehicle_id": vehicle_id},
        {"_id": 0, "purchase_cost": 1, "currency": 1}
    ).to_list(100)
    tire_cost = sum(t.get('purchase_cost', 0) * 0.065 for t in tires)  # Convert to USD approx
    
    # Distance from logbook
    logbook = await db.driver_logbook.find(
        {"vehicle_id": vehicle_id, "date": {"$gte": start_date}},
        {"_id": 0, "distance_km": 1}
    ).to_list(1000)
    total_distance = sum(e.get('distance_km', 0) for e in logbook)
    
    # Calculate totals
    total_cost = fuel_cost + maintenance_cost + tire_cost
    cost_per_km = total_cost / total_distance if total_distance > 0 else 0
    
    return {
        "vehicle_id": vehicle_id,
        "registration_number": vehicle.get('registration_number'),
        "period_days": period_days,
        "costs": {
            "fuel": round(fuel_cost, 2),
            "maintenance": round(maintenance_cost, 2),
            "tires": round(tire_cost, 2),
            "total": round(total_cost, 2)
        },
        "utilization": {
            "total_distance_km": round(total_distance, 2),
            "total_trips": len(logbook),
            "total_fuel_liters": round(total_fuel, 2),
            "fuel_efficiency_km_per_liter": round(total_distance / total_fuel, 2) if total_fuel > 0 else 0
        },
        "metrics": {
            "cost_per_km_usd": round(cost_per_km, 4),
            "cost_per_day_usd": round(total_cost / period_days, 2)
        },
        "currency": "USD"
    }


@api_router.get("/tco/fleet")
async def get_fleet_tco(country: Optional[str] = None, period_days: int = 365):
    """Calculate TCO for entire fleet"""
    country_filter = country_filter_query(country) if country else {}
    vehicles = await db.vehicles.find(country_filter, {"_id": 0, "id": 1}).to_list(1000)
    
    fleet_tco = {
        "fuel": 0,
        "maintenance": 0,
        "tires": 0,
        "total": 0
    }
    total_distance = 0
    
    for vehicle in vehicles:
        try:
            tco = await get_vehicle_tco(vehicle['id'], period_days)
            fleet_tco['fuel'] += tco['costs']['fuel']
            fleet_tco['maintenance'] += tco['costs']['maintenance']
            fleet_tco['tires'] += tco['costs']['tires']
            fleet_tco['total'] += tco['costs']['total']
            total_distance += tco['utilization']['total_distance_km']
        except Exception:
            pass
    
    return {
        "period_days": period_days,
        "country": country,
        "vehicle_count": len(vehicles),
        "costs": {k: round(v, 2) for k, v in fleet_tco.items()},
        "total_distance_km": round(total_distance, 2),
        "cost_per_km_usd": round(fleet_tco['total'] / total_distance, 4) if total_distance > 0 else 0,
        "currency": "USD"
    }


@api_router.get("/reports/expense-breakdown")
async def get_expense_breakdown(country: Optional[str] = None, period_days: int = 30):
    """Get expense breakdown by category"""
    start_date = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    country_filter = country_filter_query(country) if country else {}
    
    # Get all expenditures
    expenditures = await db.expenditures.find(
        {**country_filter, "date": {"$gte": start_date}},
        {"_id": 0}
    ).to_list(1000)
    
    # Group by category
    breakdown = {}
    for exp in expenditures:
        category = exp.get('category', 'OTHER')
        if category not in breakdown:
            breakdown[category] = {"count": 0, "total_usd": 0}
        breakdown[category]['count'] += 1
        breakdown[category]['total_usd'] += exp.get('amount_usd', 0)
    
    # Add fuel
    fuel_txns = await db.fuel_transactions.find(
        {**country_filter, "date": {"$gte": start_date}},
        {"_id": 0, "cost_usd": 1}
    ).to_list(1000)
    breakdown['FUEL'] = {
        "count": len(fuel_txns),
        "total_usd": round(sum(f.get('cost_usd', 0) for f in fuel_txns), 2)
    }
    
    # Add maintenance
    maintenance = await db.maintenance_records.find(
        {**country_filter, "date": {"$gte": start_date}},
        {"_id": 0, "cost_usd": 1}
    ).to_list(1000)
    breakdown['MAINTENANCE'] = {
        "count": len(maintenance),
        "total_usd": round(sum(m.get('cost_usd', 0) for m in maintenance), 2)
    }
    
    # Round values
    for k, v in breakdown.items():
        v['total_usd'] = round(v['total_usd'], 2)
    
    total = sum(v['total_usd'] for v in breakdown.values())
    
    return {
        "period_days": period_days,
        "country": country,
        "breakdown": breakdown,
        "total_usd": round(total, 2)
    }


@api_router.get("/reports/utilization")
async def get_utilization_report(country: Optional[str] = None, period_days: int = 30):
    """Get fleet utilization report"""
    start_date = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    country_filter = country_filter_query(country) if country else {}
    
    vehicles = await db.vehicles.find(country_filter, {"_id": 0}).to_list(1000)
    utilization_data = []
    
    for vehicle in vehicles:
        logbook = await db.driver_logbook.find(
            {"vehicle_id": vehicle['id'], "date": {"$gte": start_date}},
            {"_id": 0}
        ).to_list(1000)
        
        total_distance = sum(e.get('distance_km', 0) for e in logbook)
        total_hours = sum(e.get('total_hours', 0) for e in logbook)
        trip_count = len(logbook)
        
        # Calculate utilization rate (assuming 8 hours/day max usage)
        max_hours = period_days * 8
        utilization_rate = (total_hours / max_hours * 100) if max_hours > 0 else 0
        
        utilization_data.append({
            "vehicle_id": vehicle['id'],
            "registration_number": vehicle.get('registration_number'),
            "country": vehicle.get('country'),
            "status": vehicle.get('status'),
            "trip_count": trip_count,
            "total_distance_km": round(total_distance, 2),
            "total_hours": round(total_hours, 2),
            "utilization_rate": round(utilization_rate, 1)
        })
    
    # Sort by utilization rate descending
    utilization_data.sort(key=lambda x: x['utilization_rate'], reverse=True)
    
    return {
        "period_days": period_days,
        "country": country,
        "vehicle_count": len(vehicles),
        "vehicles": utilization_data,
        "fleet_avg_utilization": round(
            sum(v['utilization_rate'] for v in utilization_data) / len(utilization_data) if utilization_data else 0,
            1
        )
    }


# ============= EMAIL REPORT ROUTES =============
@api_router.post("/reports/send-daily")
async def send_daily_report(current_user: dict = Depends(require_group_manager())):
    """Send daily fleet report to Group Fleet Manager"""
    from datetime import date
    
    # Get dashboard stats
    stats = await get_dashboard_stats()
    
    # Get alerts
    alerts_data = await get_dashboard_alerts()
    
    # Get compliance
    compliance_data = await get_compliance_status()
    
    # Get pending users
    pending_users = await db.users.count_documents({"is_approved": False})
    
    # Prepare report data
    report_data = {
        "date": date.today().strftime("%B %d, %Y"),
        "total_vehicles": stats.get('total_vehicles', 0),
        "active_vehicles": stats.get('active_vehicles', 0),
        "total_drivers": stats.get('total_drivers', 0),
        "pending_maintenance": stats.get('pending_maintenance', 0),
        "pending_requests": stats.get('pending_requests', 0),
        "pending_users": pending_users,
        "alert_count": alerts_data.get('total_count', 0),
        "alerts": alerts_data.get('alerts', [])[:10],
        "compliance": compliance_data.get('summary', {}),
        "maintenance_cost_ghs": stats.get('total_maintenance_cost_ghs', 0),
        "fuel_cost_usd": stats.get('total_fuel_cost_usd', 0),
        "ghs_rate": stats.get('ghs_exchange_rate', 12.0),
    }
    
    # Get Group Fleet Manager email
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0, "email": 1})
    if user and user.get('email'):
        success = email_service.send_daily_fleet_report(user['email'], report_data)
        if success:
            return {"status": "success", "message": f"Daily report sent to {user['email']}"}
        else:
            return {"status": "info", "message": "Email service not configured. Report generated but not sent."}
    
    return {"status": "error", "message": "User email not found"}


@api_router.post("/reports/send-weekly")
async def send_weekly_report(current_user: dict = Depends(require_group_manager())):
    """Send weekly summary report to Group Fleet Manager"""
    from datetime import date, timedelta as td
    
    # Calculate week dates
    today = date.today()
    week_start = today - td(days=today.weekday())
    week_end = week_start + td(days=6)
    
    # Get stats for the week
    start_date = week_start.isoformat()
    
    # Count trips
    trips = await db.driver_logbook.count_documents({"date": {"$gte": start_date}})
    
    # Total distance
    logbook_entries = await db.driver_logbook.find(
        {"date": {"$gte": start_date}},
        {"_id": 0, "distance_km": 1, "speed_limit_violations": 1}
    ).to_list(1000)
    total_distance = sum(e.get('distance_km', 0) for e in logbook_entries)
    speed_violations = sum(e.get('speed_limit_violations', 0) for e in logbook_entries)
    
    # Maintenance completed
    maintenance_completed = await db.maintenance_records.count_documents({
        "completed_date": {"$gte": start_date}
    })
    
    # Checklists
    checklists = await db.pretrip_checklists.count_documents({"date": {"$gte": start_date}})
    
    # Costs
    fuel_txns = await db.fuel_transactions.find(
        {"date": {"$gte": start_date}},
        {"_id": 0, "cost_usd": 1}
    ).to_list(1000)
    fuel_cost_usd = sum(f.get('cost_usd', 0) for f in fuel_txns)
    ghs_rate = 12.0
    
    maintenance_records = await db.maintenance_records.find(
        {"date": {"$gte": start_date}},
        {"_id": 0, "cost_usd": 1}
    ).to_list(1000)
    maintenance_cost_usd = sum(m.get('cost_usd', 0) for m in maintenance_records)
    
    # Utilization
    utilization_data = await get_utilization_report(period_days=7)
    
    # Driver safety scores
    drivers = await db.drivers.find({}, {"_id": 0, "safety_score": 1}).to_list(1000)
    avg_safety = sum(d.get('safety_score', 80) for d in drivers) / len(drivers) if drivers else 80
    
    report_data = {
        "week_start": week_start.strftime("%B %d, %Y"),
        "week_end": week_end.strftime("%B %d, %Y"),
        "generated_date": today.strftime("%B %d, %Y"),
        "trips_completed": trips,
        "distance_km": total_distance,
        "maintenance_completed": maintenance_completed,
        "fuel_cost_ghs": round(fuel_cost_usd * ghs_rate, 2),
        "maintenance_cost_ghs": round(maintenance_cost_usd * ghs_rate, 2),
        "total_cost_ghs": round((fuel_cost_usd + maintenance_cost_usd) * ghs_rate, 2),
        "avg_utilization": utilization_data.get('fleet_avg_utilization', 0),
        "speed_violations": speed_violations,
        "checklists_completed": checklists,
        "avg_safety_score": round(avg_safety, 0),
    }
    
    # Get Group Fleet Manager email
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0, "email": 1})
    if user and user.get('email'):
        success = email_service.send_weekly_summary_report(user['email'], report_data)
        if success:
            return {"status": "success", "message": f"Weekly report sent to {user['email']}"}
        else:
            return {"status": "info", "message": "Email service not configured. Report generated but not sent.", "report_data": report_data}
    
    return {"status": "error", "message": "User email not found"}


def _cors_allow_origins() -> list:
    raw = os.environ.get("CORS_ORIGINS", "").strip()
    if _IS_PRODUCTION:
        if not raw:
            raise RuntimeError(
                "CORS_ORIGINS must be set in production (comma-separated origins, e.g. https://app.example.com)"
            )
        return [o.strip() for o in raw.split(",") if o.strip()]
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return ["http://localhost:3000", "http://127.0.0.1:3000"]


@app.get("/health")
async def health():
    return {"status": "ok"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(JWTAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_allow_origins(),
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Bootstrap-Token"],
)

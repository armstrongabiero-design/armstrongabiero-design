from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone
import base64

from models import (
    Country, CountryCreate, CountryEnum,
    Vehicle, VehicleCreate, VehicleUpdate,
    Driver, DriverCreate, DriverUpdate,
    MaintenanceRecord, MaintenanceRecordCreate,
    WorkshopJob, WorkshopJobCreate,
    InventoryItem, InventoryItemCreate,
    InventoryTransaction, InventoryTransactionCreate,
    FuelTransaction, FuelTransactionCreate,
    Expenditure, ExpenditureCreate,
    Document, DocumentCreate,
    Asset, AssetCreate,
    SafetyIncident, SafetyIncidentCreate,
    ExchangeRate, ExchangeRateCreate,
    AIPrediction, AIPredictionCreate,
    CurrencyEnum, DocumentType,
    MaintenanceRequest, MaintenanceRequestCreate, MaintenanceRequestApproval,
    PreTripChecklist, PreTripChecklistCreate, ChecklistItem, ChecklistItemStatus,
    FleetManager, FleetManagerCreate, RequestStatus, RequestPriority
)
from currency_utils import currency_converter
from ai_services import ai_service
from email_service import email_service


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Fleet Management System")

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


@api_router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str):
    result = await db.vehicles.delete_one({"id": vehicle_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
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
async def create_fuel_transaction(input: FuelTransactionCreate):
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


# ============= DOCUMENT ROUTES =============
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


@api_router.post("/documents/{document_id}/ocr")
async def process_document_ocr(document_id: str, file: UploadFile = File(...)):
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Read and encode image
    image_bytes = await file.read()
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    # Process with AI OCR
    ocr_result = await ai_service.ocr_document(
        image_base64,
        document.get('document_type'),
        document.get('country')
    )
    
    # Update document with OCR data
    await db.documents.update_one(
        {"id": document_id},
        {"$set": {
            "ocr_processed": True,
            "ocr_data": ocr_result,
            "validated": ocr_result.get("validation_status") == "VALID"
        }}
    )
    
    return ocr_result


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


# ============= DASHBOARD/ANALYTICS ROUTES =============
@api_router.get("/dashboard/stats")
async def get_dashboard_stats():
    total_vehicles = await db.vehicles.count_documents({})
    active_vehicles = await db.vehicles.count_documents({"status": "ACTIVE"})
    total_drivers = await db.drivers.count_documents({})
    pending_maintenance = await db.maintenance_records.count_documents({"completed_date": None})
    
    # Total fleet value
    assets = await db.assets.find({}, {"_id": 0, "current_value_usd": 1}).to_list(1000)
    total_fleet_value = sum(a.get('current_value_usd', 0) for a in assets)
    
    # Monthly fuel cost
    fuel_txns = await db.fuel_transactions.find({}, {"_id": 0, "cost_usd": 1}).to_list(1000)
    total_fuel_cost = sum(f.get('cost_usd', 0) for f in fuel_txns)
    
    return {
        "total_vehicles": total_vehicles,
        "active_vehicles": active_vehicles,
        "total_drivers": total_drivers,
        "pending_maintenance": pending_maintenance,
        "total_fleet_value_usd": round(total_fleet_value, 2),
        "total_fuel_cost_usd": round(total_fuel_cost, 2)
    }


# Root route
@api_router.get("/")
async def root():
    return {
        "message": "Fleet Management System API",
        "version": "1.0.0",
        "modules": [
            "Countries", "Vehicles", "Drivers", "Maintenance",
            "Workshops", "Inventory", "Fuel", "Expenditures",
            "Documents", "Assets", "Safety", "Exchange Rates"
        ]
    }


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

"""Fuel, Inventory, Expenditure, Logbook, Safety, Tires, Vendors, Locations, Documents, Assets, Exchange, TCO routes"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import base64

from database import db
from models import (
    FuelTransaction, FuelTransactionCreate,
    Expenditure, ExpenditureCreate,
    InventoryItem, InventoryItemCreate,
    InventoryTransaction, InventoryTransactionCreate,
    Document, DocumentCreate,
    Asset, AssetCreate, AIPrediction,
    SafetyIncident, SafetyIncidentCreate,
    ExchangeRate,
    Tire, TireCreate, TireRotation, TireRotationCreate,
    Vendor, VendorCreate,
    VehicleLocation, VehicleLocationCreate,
    LogbookEntry, LogbookEntryCreate,
    CurrencyEnum,
)
from auth_service import get_current_user
from currency_utils import currency_converter
from ai_services import ai_service

router = APIRouter()


# ============= FUEL ROUTES =============
@router.post("/fuel", response_model=FuelTransaction)
async def create_fuel_transaction(input: FuelTransactionCreate, current_user: dict = Depends(get_current_user)):
    cost_usd = currency_converter.convert(input.cost, input.currency, CurrencyEnum.USD)
    prev_fuel = await db.fuel_transactions.find_one({"vehicle_id": input.vehicle_id}, {"_id": 0}, sort=[("created_at", -1)])
    fuel_efficiency = None
    odometer_change = 0
    if prev_fuel:
        odometer_change = input.odometer_reading - prev_fuel.get('odometer_reading', 0)
        if odometer_change > 0 and input.quantity_liters > 0:
            fuel_efficiency = round(odometer_change / input.quantity_liters, 2)
    fuel_data = input.model_dump()
    fuel_data['cost_usd'] = cost_usd
    fuel_data['fuel_efficiency'] = fuel_efficiency
    fuel_transaction = FuelTransaction(**fuel_data)
    if fuel_efficiency:
        anomaly_data = {"vehicle_id": input.vehicle_id, "quantity_liters": input.quantity_liters, "cost": input.cost, "currency": input.currency.value, "odometer_change": odometer_change, "avg_efficiency": fuel_efficiency, "location": input.location}
        anomaly_result = await ai_service.analyze_fuel_anomaly(anomaly_data)
        fuel_transaction.anomaly_detected = anomaly_result.get("anomaly_detected", False)
        fuel_transaction.anomaly_reason = anomaly_result.get("explanation", "")
    doc = fuel_transaction.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    if input.driver_id and input.driver_id != current_user.get('id') and input.driver_id != current_user.get('driver_id'):
        doc['submitted_by_id'] = current_user.get('id')
        doc['submitted_by_name'] = current_user.get('full_name')
        doc['submitted_by_role'] = current_user.get('role')
    await db.fuel_transactions.insert_one(doc)
    return fuel_transaction


@router.get("/fuel", response_model=List[FuelTransaction])
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
@router.post("/expenditures", response_model=Expenditure)
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


@router.get("/expenditures", response_model=List[Expenditure])
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


# ============= INVENTORY ROUTES =============
@router.post("/inventory", response_model=InventoryItem)
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


@router.get("/inventory", response_model=List[InventoryItem])
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


@router.post("/inventory/transactions", response_model=InventoryTransaction)
async def create_inventory_transaction(input: InventoryTransactionCreate):
    transaction = InventoryTransaction(**input.model_dump())
    item = await db.inventory_items.find_one({"id": input.item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    quantity_change = input.quantity if input.transaction_type in ["PURCHASE", "ADJUSTMENT"] else -input.quantity
    new_quantity = item['quantity'] + quantity_change
    if new_quantity < 0:
        raise HTTPException(status_code=400, detail="Insufficient inventory")
    await db.inventory_items.update_one({"id": input.item_id}, {"$set": {"quantity": new_quantity, "updated_at": datetime.utcnow().isoformat()}})
    doc = transaction.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.inventory_transactions.insert_one(doc)
    return transaction


@router.get("/inventory/transactions", response_model=List[InventoryTransaction])
async def get_inventory_transactions(item_id: Optional[str] = None):
    query = {}
    if item_id:
        query['item_id'] = item_id
    transactions = await db.inventory_transactions.find(query, {"_id": 0}).to_list(1000)
    for t in transactions:
        if isinstance(t.get('created_at'), str):
            t['created_at'] = datetime.fromisoformat(t['created_at'])
    return transactions


# ============= DOCUMENT ROUTES =============
@router.post("/documents", response_model=Document)
async def create_document(input: DocumentCreate):
    document = Document(**input.model_dump())
    doc = document.model_dump()
    doc['issue_date'] = doc['issue_date'].isoformat()
    doc['expiry_date'] = doc['expiry_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.documents.insert_one(doc)
    return document


@router.get("/documents", response_model=List[Document])
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


@router.post("/documents/{document_id}/ocr")
async def process_document_ocr(document_id: str, file: UploadFile = File(...)):
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    image_bytes = await file.read()
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    ocr_result = await ai_service.ocr_document(image_base64, document.get('document_type'), document.get('country'))
    await db.documents.update_one({"id": document_id}, {"$set": {"ocr_processed": True, "ocr_data": ocr_result, "validated": ocr_result.get("validation_status") == "VALID"}})
    return ocr_result


# ============= ASSET ROUTES =============
@router.post("/assets", response_model=Asset)
async def create_asset(input: AssetCreate):
    acquisition_cost_usd = currency_converter.convert(input.acquisition_cost, input.currency, CurrencyEnum.USD)
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


@router.get("/assets", response_model=List[Asset])
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


@router.post("/assets/{asset_id}/predict-resale")
async def predict_asset_resale(asset_id: str):
    asset = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    vehicle = await db.vehicles.find_one({"id": asset['vehicle_id']}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    acquisition_date = datetime.fromisoformat(asset['acquisition_date']) if isinstance(asset['acquisition_date'], str) else asset['acquisition_date']
    if acquisition_date.tzinfo is not None:
        acquisition_date = acquisition_date.replace(tzinfo=None)
    age_years = (datetime.utcnow() - acquisition_date).days / 365.25
    asset_data = {"vehicle_id": vehicle['id'], "make": vehicle.get("make"), "model": vehicle.get("model"), "year": vehicle.get("year"), "age_years": round(age_years, 1), "odometer": vehicle.get("odometer_reading"), "condition": "Good", "maintenance_score": "Average", "country": vehicle.get("country"), "original_cost_usd": asset.get("acquisition_cost_usd")}
    prediction = await ai_service.predict_resale_value(asset_data)
    await db.assets.update_one({"id": asset_id}, {"$set": {"predicted_resale_value": prediction.get("predicted_value_usd"), "updated_at": datetime.utcnow().isoformat()}})
    return prediction


# ============= SAFETY ROUTES =============
@router.post("/safety/incidents", response_model=SafetyIncident)
async def create_safety_incident(input: SafetyIncidentCreate):
    cost_usd = None
    if input.cost and input.currency:
        cost_usd = currency_converter.convert(input.cost, input.currency, CurrencyEnum.USD)
    incident_data = input.model_dump()
    incident_data['cost_usd'] = cost_usd
    incident = SafetyIncident(**incident_data)
    driver = await db.drivers.find_one({"id": input.driver_id}, {"_id": 0})
    if driver:
        severity_penalties = {"LOW": 2, "MEDIUM": 5, "HIGH": 10}
        penalty = severity_penalties.get(input.severity, 5)
        new_safety_score = max(0, driver.get('safety_score', 100) - penalty)
        new_incident_count = driver.get('total_incidents', 0) + 1
        await db.drivers.update_one({"id": input.driver_id}, {"$set": {"safety_score": new_safety_score, "total_incidents": new_incident_count, "updated_at": datetime.utcnow().isoformat()}})
    doc = incident.model_dump()
    doc['incident_date'] = doc['incident_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.safety_incidents.insert_one(doc)
    return incident


@router.get("/safety/incidents", response_model=List[SafetyIncident])
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
@router.get("/exchange-rates/current")
async def get_current_rates():
    rates = {}
    for currency in [CurrencyEnum.GHS, CurrencyEnum.LRD, CurrencyEnum.STN]:
        rate = currency_converter.get_rate(currency, CurrencyEnum.USD)
        rates[currency.value] = rate
        exchange_rate = ExchangeRate(from_currency=currency, to_currency=CurrencyEnum.USD, rate=rate)
        doc = exchange_rate.model_dump()
        doc['date'] = doc['date'].isoformat()
        await db.exchange_rates.insert_one(doc)
    return {"rates": rates, "base": "USD", "timestamp": datetime.utcnow().isoformat()}


@router.get("/exchange-rates/history")
async def get_exchange_rate_history(currency: str, days: int = 30):
    rates = await db.exchange_rates.find({"from_currency": currency}, {"_id": 0}).sort("date", -1).limit(days).to_list(days)
    for r in rates:
        if isinstance(r.get('date'), str):
            r['date'] = datetime.fromisoformat(r['date'])
    return rates


# ============= TIRE ROUTES =============
@router.post("/tires", response_model=Tire)
async def create_tire(input: TireCreate):
    tire = Tire(**input.model_dump())
    doc = tire.model_dump()
    for field in ['purchase_date', 'last_rotation_date', 'next_rotation_due', 'created_at', 'updated_at']:
        if doc.get(field):
            doc[field] = doc[field].isoformat()
    await db.tires.insert_one(doc)
    return tire


@router.get("/tires")
async def get_tires(country: Optional[str] = None, vehicle_id: Optional[str] = None, status: Optional[str] = None):
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


@router.get("/tires/{tire_id}")
async def get_tire(tire_id: str):
    tire = await db.tires.find_one({"id": tire_id}, {"_id": 0})
    if not tire:
        raise HTTPException(status_code=404, detail="Tire not found")
    return tire


@router.put("/tires/{tire_id}")
async def update_tire(tire_id: str, update_data: dict):
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    result = await db.tires.update_one({"id": tire_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Tire not found")
    return {"status": "success"}


@router.post("/tires/rotations", response_model=TireRotation)
async def record_tire_rotation(input: TireRotationCreate):
    rotation = TireRotation(**input.model_dump())
    doc = rotation.model_dump()
    for field in ['rotation_date', 'created_at']:
        if doc.get(field):
            doc[field] = doc[field].isoformat()
    await db.tire_rotations.insert_one(doc)
    for rot in input.rotations:
        next_rotation = datetime.now(timezone.utc) + timedelta(days=90)
        await db.tires.update_one({"id": rot['tire_id']}, {"$set": {"position": rot['to_position'], "last_rotation_date": datetime.now(timezone.utc).isoformat(), "next_rotation_due": next_rotation.isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}})
    return rotation


@router.get("/tires/rotations/history")
async def get_tire_rotation_history(vehicle_id: Optional[str] = None):
    query = {}
    if vehicle_id:
        query['vehicle_id'] = vehicle_id
    rotations = await db.tire_rotations.find(query, {"_id": 0}).sort("rotation_date", -1).to_list(100)
    return rotations


# ============= LOGBOOK ROUTES =============
@router.post("/logbook", response_model=LogbookEntry)
async def create_logbook_entry(input: LogbookEntryCreate, current_user: dict = Depends(get_current_user)):
    entry_data = input.model_dump()
    if not entry_data.get('country'):
        driver = await db.drivers.find_one({"id": input.driver_id}, {"_id": 0, "country": 1})
        if driver:
            entry_data['country'] = driver.get('country')
        elif current_user.get('country'):
            entry_data['country'] = current_user.get('country')
    entry = LogbookEntry(**entry_data)
    if input.end_odometer and not entry.distance_km:
        entry.distance_km = input.end_odometer - input.start_odometer
    doc = entry.model_dump()
    if input.driver_id != current_user.get('id') and input.driver_id != current_user.get('driver_id'):
        doc['submitted_by_id'] = current_user.get('id')
        doc['submitted_by_name'] = current_user.get('full_name')
        doc['submitted_by_role'] = current_user.get('role')
    for field in ['date', 'start_time', 'end_time', 'created_at']:
        if doc.get(field):
            doc[field] = doc[field].isoformat()
    await db.driver_logbook.insert_one(doc)
    return doc


@router.get("/logbook")
async def get_logbook_entries(driver_id: Optional[str] = None, vehicle_id: Optional[str] = None, country: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
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


@router.get("/logbook/summary/{driver_id}")
async def get_driver_logbook_summary(driver_id: str, period_days: int = 30):
    start_date = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    entries = await db.driver_logbook.find({"driver_id": driver_id, "date": {"$gte": start_date}}, {"_id": 0}).to_list(1000)
    total_distance = sum(e.get('distance_km', 0) for e in entries)
    total_trips = len(entries)
    total_violations = sum(e.get('speed_limit_violations', 0) for e in entries)
    total_fuel = sum(e.get('fuel_used_liters', 0) for e in entries)
    return {
        "driver_id": driver_id, "period_days": period_days,
        "total_trips": total_trips, "total_distance_km": round(total_distance, 2),
        "total_fuel_liters": round(total_fuel, 2),
        "avg_fuel_efficiency": round(total_distance / total_fuel, 2) if total_fuel > 0 else 0,
        "speed_violations": total_violations,
        "harsh_braking_events": sum(e.get('harsh_braking_events', 0) for e in entries),
        "harsh_acceleration_events": sum(e.get('harsh_acceleration_events', 0) for e in entries)
    }


# ============= VENDOR ROUTES =============
@router.post("/vendors", response_model=Vendor)
async def create_vendor(input: VendorCreate):
    vendor = Vendor(**input.model_dump())
    doc = vendor.model_dump()
    for field in ['created_at', 'updated_at']:
        if doc.get(field):
            doc[field] = doc[field].isoformat()
    await db.vendors.insert_one(doc)
    return vendor


@router.get("/vendors")
async def get_vendors(country: Optional[str] = None, category: Optional[str] = None):
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


@router.get("/vendors/{vendor_id}")
async def get_vendor(vendor_id: str):
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


@router.put("/vendors/{vendor_id}")
async def update_vendor(vendor_id: str, update_data: dict):
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    result = await db.vendors.update_one({"id": vendor_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return {"status": "success"}


# ============= VEHICLE LOCATION ROUTES =============
@router.post("/vehicle-locations", response_model=VehicleLocation)
async def create_vehicle_location(input: VehicleLocationCreate):
    location = VehicleLocation(**input.model_dump())
    doc = location.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.vehicle_locations.insert_one(doc)
    await db.vehicles.update_one({"id": input.vehicle_id}, {"$set": {"last_location": {"latitude": input.latitude, "longitude": input.longitude, "address": input.address, "timestamp": doc['timestamp']}}})
    return location


@router.get("/vehicle-locations")
async def get_vehicle_locations(country: Optional[str] = None):
    query = {}
    if country:
        query['country'] = country
    vehicles = await db.vehicles.find(query, {"_id": 0}).to_list(1000)
    locations = []
    for vehicle in vehicles:
        last_loc = vehicle.get('last_location')
        if last_loc:
            locations.append({"vehicle_id": vehicle['id'], "registration_number": vehicle.get('registration_number'), "make": vehicle.get('make'), "model": vehicle.get('model'), "country": vehicle.get('country'), "status": vehicle.get('status'), **last_loc})
    return locations


@router.get("/vehicle-locations/{vehicle_id}/history")
async def get_vehicle_location_history(vehicle_id: str, hours: int = 24):
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    locations = await db.vehicle_locations.find({"vehicle_id": vehicle_id, "timestamp": {"$gte": since}}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return locations


# ============= TCO ROUTES =============
@router.get("/tco/vehicle/{vehicle_id}")
async def get_vehicle_tco(vehicle_id: str, period_days: int = 365):
    start_date = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    fuel_txns = await db.fuel_transactions.find({"vehicle_id": vehicle_id, "date": {"$gte": start_date}}, {"_id": 0, "cost_usd": 1, "quantity_liters": 1}).to_list(1000)
    fuel_cost = sum(f.get('cost_usd', 0) for f in fuel_txns)
    total_fuel = sum(f.get('quantity_liters', 0) for f in fuel_txns)
    maintenance = await db.maintenance_records.find({"vehicle_id": vehicle_id, "date": {"$gte": start_date}}, {"_id": 0, "cost_usd": 1}).to_list(1000)
    maintenance_cost = sum(m.get('cost_usd', 0) for m in maintenance)
    tires = await db.tires.find({"vehicle_id": vehicle_id}, {"_id": 0, "purchase_cost": 1, "currency": 1}).to_list(100)
    tire_cost = sum(t.get('purchase_cost', 0) * 0.065 for t in tires)
    logbook = await db.driver_logbook.find({"vehicle_id": vehicle_id, "date": {"$gte": start_date}}, {"_id": 0, "distance_km": 1}).to_list(1000)
    total_distance = sum(e.get('distance_km', 0) for e in logbook)
    total_cost = fuel_cost + maintenance_cost + tire_cost
    cost_per_km = total_cost / total_distance if total_distance > 0 else 0
    return {
        "vehicle_id": vehicle_id, "registration_number": vehicle.get('registration_number'), "period_days": period_days,
        "costs": {"fuel": round(fuel_cost, 2), "maintenance": round(maintenance_cost, 2), "tires": round(tire_cost, 2), "total": round(total_cost, 2)},
        "utilization": {"total_distance_km": round(total_distance, 2), "total_trips": len(logbook), "total_fuel_liters": round(total_fuel, 2), "fuel_efficiency_km_per_liter": round(total_distance / total_fuel, 2) if total_fuel > 0 else 0},
        "metrics": {"cost_per_km_usd": round(cost_per_km, 4), "cost_per_day_usd": round(total_cost / period_days, 2)},
        "currency": "USD"
    }


@router.get("/tco/fleet")
async def get_fleet_tco(country: Optional[str] = None, period_days: int = 365):
    country_filter = {"country": country} if country else {}
    vehicles = await db.vehicles.find(country_filter, {"_id": 0, "id": 1}).to_list(1000)
    fleet_tco = {"fuel": 0, "maintenance": 0, "tires": 0, "total": 0}
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
        "period_days": period_days, "country": country, "vehicle_count": len(vehicles),
        "costs": {k: round(v, 2) for k, v in fleet_tco.items()},
        "total_distance_km": round(total_distance, 2),
        "cost_per_km_usd": round(fleet_tco['total'] / total_distance, 4) if total_distance > 0 else 0,
        "currency": "USD"
    }

"""Dashboard, alerts, and compliance routes"""
from fastapi import APIRouter, Depends
from typing import Optional
from datetime import datetime, timezone, timedelta

from database import db
from models import CurrencyEnum
from auth_service import get_current_user
from currency_utils import currency_converter

router = APIRouter()


@router.get("/")
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


@router.get("/dashboard/stats")
async def get_dashboard_stats(country: Optional[str] = None):
    """Get dashboard statistics with optional country filter"""
    country_filter = {"country": country} if country else {}
    total_vehicles = await db.vehicles.count_documents(country_filter)
    active_vehicles = await db.vehicles.count_documents({**country_filter, "status": "ACTIVE"})
    total_drivers = await db.drivers.count_documents(country_filter)
    pending_maintenance = await db.maintenance_records.count_documents({**country_filter, "completed_date": None})
    pending_requests = await db.maintenance_requests.count_documents({**country_filter, "status": "PENDING"})
    assets = await db.assets.find(country_filter, {"_id": 0, "current_value_usd": 1}).to_list(1000)
    total_fleet_value = sum(a.get('current_value_usd', 0) for a in assets)
    fuel_txns = await db.fuel_transactions.find(country_filter, {"_id": 0, "cost_usd": 1}).to_list(1000)
    total_fuel_cost = sum(f.get('cost_usd', 0) for f in fuel_txns)
    maintenance_records = await db.maintenance_records.find(country_filter, {"_id": 0, "cost": 1, "currency": 1, "cost_usd": 1}).to_list(1000)
    total_maintenance_cost_usd = sum(m.get('cost_usd', 0) for m in maintenance_records)
    ghs_rate = currency_converter.get_rate(CurrencyEnum.USD, CurrencyEnum.GHS)
    total_maintenance_cost_ghs = total_maintenance_cost_usd * ghs_rate
    vehicles_by_country = {}
    drivers_by_country = {}
    for c in ['GHANA', 'LIBERIA', 'SAO_TOME']:
        vehicles_by_country[c] = await db.vehicles.count_documents({"country": c})
        drivers_by_country[c] = await db.drivers.count_documents({"country": c})
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


@router.get("/dashboard/personal")
async def get_personal_dashboard(current_user: dict = Depends(get_current_user)):
    """Get personalized dashboard stats for drivers/users"""
    user_id = current_user['id']
    driver_id = current_user.get('driver_id') or user_id
    from_date = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    logbook_entries = await db.driver_logbook.find(
        {"driver_id": driver_id, "date": {"$gte": from_date}}, {"_id": 0}
    ).to_list(100)
    total_trips = len(logbook_entries)
    total_distance = sum(e.get('distance_km', 0) for e in logbook_entries)
    total_fuel = sum(e.get('fuel_used_liters', 0) for e in logbook_entries)
    my_requests = await db.maintenance_requests.find(
        {"driver_id": driver_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    pending_requests = len([r for r in my_requests if r.get('status') == 'PENDING'])
    approved_requests = len([r for r in my_requests if r.get('status') == 'APPROVED'])
    today = datetime.now(timezone.utc).date()
    start_of_day = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    today_checklist = await db.pretrip_checklists.find_one(
        {"driver_id": driver_id, "date": {"$gte": start_of_day.isoformat()}}, {"_id": 0}
    )
    assigned_vehicle = None
    if current_user.get('driver_id'):
        driver = await db.drivers.find_one({"id": current_user['driver_id']}, {"_id": 0})
        if driver and driver.get('assigned_vehicle_id'):
            assigned_vehicle = await db.vehicles.find_one(
                {"id": driver['assigned_vehicle_id']},
                {"_id": 0, "registration_number": 1, "make": 1, "model": 1, "status": 1}
            )
    speed_violations = sum(e.get('speed_limit_violations', 0) for e in logbook_entries)
    return {
        "user_id": user_id, "driver_id": driver_id, "period_days": 30,
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


@router.get("/dashboard/staff")
async def get_staff_dashboard(current_user: dict = Depends(get_current_user)):
    """Get dashboard stats for Fleet Managers and Fleet Officers (country-specific)"""
    user_role = current_user.get('role')
    user_country = current_user.get('country')

    def normalize_country(country):
        if not country:
            return None
        country_upper = country.upper().replace(' ', '_').replace('É', 'E')
        if 'GHANA' in country_upper:
            return 'GHANA'
        if 'LIBERIA' in country_upper:
            return 'LIBERIA'
        if 'SAO' in country_upper or 'TOME' in country_upper or 'STP' in country_upper:
            return 'SAO_TOME'
        return country_upper

    normalized_country = normalize_country(user_country)
    if user_role == 'GROUP_FLEET_MANAGER':
        country_filter = {}
    else:
        country_regex = {"$regex": f"^{normalized_country}$", "$options": "i"} if normalized_country else {"$exists": False}
        country_filter = {"country": country_regex}

    total_vehicles = await db.vehicles.count_documents(country_filter)
    active_vehicles = await db.vehicles.count_documents({**country_filter, "status": "ACTIVE"})
    total_drivers = await db.drivers.count_documents(country_filter)
    pending_maintenance = await db.maintenance_records.count_documents({**country_filter, "completed_date": None})
    request_filter = {} if user_role == 'GROUP_FLEET_MANAGER' else country_filter
    pending_requests = await db.maintenance_requests.find(
        {**request_filter, "status": "PENDING"}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)

    pending_users_query = {"is_approved": False}
    if user_role == 'GROUP_FLEET_MANAGER':
        pass
    elif user_role == 'FLEET_MANAGER':
        if normalized_country:
            pending_users_query['country'] = {"$regex": f"^{normalized_country}$", "$options": "i"}
        pending_users_query['role'] = {"$in": ['FLEET_OFFICER', 'DRIVER', 'USER']}
    elif user_role == 'FLEET_OFFICER':
        if normalized_country:
            pending_users_query['country'] = {"$regex": f"^{normalized_country}$", "$options": "i"}
        pending_users_query['role'] = {"$in": ['DRIVER', 'USER']}
    else:
        pending_users_query['id'] = 'NONE'

    pending_users = await db.users.find(pending_users_query, {"_id": 0, "hashed_password": 0}).to_list(50)
    assets = await db.assets.find(country_filter, {"_id": 0, "current_value_usd": 1}).to_list(1000)
    total_fleet_value = sum(a.get('current_value_usd', 0) for a in assets)
    fuel_txns = await db.fuel_transactions.find(country_filter, {"_id": 0, "cost_usd": 1}).to_list(1000)
    total_fuel_cost = sum(f.get('cost_usd', 0) for f in fuel_txns)
    maintenance_records = await db.maintenance_records.find(country_filter, {"_id": 0, "cost_usd": 1}).to_list(1000)
    total_maintenance_cost_usd = sum(m.get('cost_usd', 0) for m in maintenance_records)
    ghs_rate = currency_converter.get_rate(CurrencyEnum.USD, CurrencyEnum.GHS)
    recent_logbook = await db.driver_logbook.find(country_filter, {"_id": 0}).sort("created_at", -1).to_list(10)

    vehicles_by_country = {}
    drivers_by_country = {}
    if user_role == 'GROUP_FLEET_MANAGER':
        for c in ['GHANA', 'LIBERIA', 'SAO_TOME']:
            vehicles_by_country[c] = await db.vehicles.count_documents({"country": {"$regex": f"^{c}$", "$options": "i"}})
            drivers_by_country[c] = await db.drivers.count_documents({"country": {"$regex": f"^{c}$", "$options": "i"}})

    return {
        "user_role": user_role, "user_country": user_country,
        "total_vehicles": total_vehicles, "active_vehicles": active_vehicles,
        "total_drivers": total_drivers, "pending_maintenance": pending_maintenance,
        "pending_requests_count": len(pending_requests), "pending_requests": pending_requests[:5],
        "pending_users_count": len(pending_users), "pending_users": pending_users[:10],
        "total_fleet_value_usd": round(total_fleet_value, 2),
        "total_fuel_cost_usd": round(total_fuel_cost, 2),
        "total_maintenance_cost_usd": round(total_maintenance_cost_usd, 2),
        "total_maintenance_cost_ghs": round(total_maintenance_cost_usd * ghs_rate, 2),
        "ghs_exchange_rate": round(ghs_rate, 2),
        "recent_activity": recent_logbook[:5],
        "vehicles_by_country": vehicles_by_country,
        "drivers_by_country": drivers_by_country
    }


@router.get("/dashboard/alerts")
async def get_dashboard_alerts(country: Optional[str] = None):
    """Get all active alerts for the dashboard"""
    country_filter = {"country": country} if country else {}
    alerts = []
    now = datetime.now(timezone.utc)

    documents = await db.documents.find(country_filter, {"_id": 0}).to_list(1000)
    for doc in documents:
        expiry = doc.get('expiry_date')
        if expiry:
            if isinstance(expiry, str):
                expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
            days_until = (expiry - now).days
            if days_until < 0:
                alerts.append({"type": "DOCUMENT_EXPIRY", "severity": "CRITICAL", "title": f"Expired: {doc.get('document_type', 'Document')}", "description": f"Document expired {abs(days_until)} days ago", "entity_type": "document", "entity_id": doc.get('id'), "country": doc.get('country'), "id": doc.get('id')})
            elif days_until <= 30:
                alerts.append({"type": "DOCUMENT_EXPIRY", "severity": "WARNING", "title": f"Expiring Soon: {doc.get('document_type', 'Document')}", "description": f"Document expires in {days_until} days", "entity_type": "document", "entity_id": doc.get('id'), "country": doc.get('country'), "id": doc.get('id')})

    fuel_txns = await db.fuel_transactions.find({**country_filter, "anomaly_detected": True}, {"_id": 0}).to_list(100)
    for txn in fuel_txns:
        vehicle = await db.vehicles.find_one({"id": txn.get('vehicle_id')}, {"_id": 0, "registration_number": 1})
        alerts.append({"type": "FUEL_ANOMALY", "severity": "WARNING", "title": "Fuel Anomaly Detected", "description": f"Unusual fuel consumption for {vehicle.get('registration_number', 'Unknown') if vehicle else 'Unknown'}", "entity_type": "fuel_transaction", "entity_id": txn.get('id'), "country": txn.get('country'), "id": txn.get('id')})

    speeding_entries = await db.driver_logbook.find({**country_filter, "speed_limit_violations": {"$gt": 0}}, {"_id": 0}).sort("date", -1).limit(20).to_list(20)
    for entry in speeding_entries:
        driver = await db.drivers.find_one({"id": entry.get('driver_id')}, {"_id": 0, "first_name": 1, "last_name": 1})
        driver_name = f"{driver.get('first_name', '')} {driver.get('last_name', '')}" if driver else "Unknown"
        alerts.append({"type": "SPEEDING", "severity": "WARNING", "title": f"Speeding: {driver_name}", "description": f"{entry.get('speed_limit_violations', 0)} violations, max speed: {entry.get('max_speed_kmh', 0)} km/h", "entity_type": "logbook_entry", "entity_id": entry.get('id'), "country": entry.get('country'), "id": entry.get('id')})

    inventory = await db.inventory_items.find(country_filter, {"_id": 0}).to_list(1000)
    for item in inventory:
        if item.get('quantity', 0) <= item.get('reorder_level', 0):
            alerts.append({"type": "LOW_STOCK", "severity": "WARNING", "title": f"Low Stock: {item.get('name')}", "description": f"Current: {item.get('quantity')}, Reorder level: {item.get('reorder_level')}", "entity_type": "inventory", "entity_id": item.get('id'), "country": item.get('country'), "id": item.get('id')})

    tires = await db.tires.find({**country_filter, "status": "IN_USE"}, {"_id": 0}).to_list(1000)
    for tire in tires:
        if tire.get('tread_depth_mm') and tire.get('tread_depth_mm') <= tire.get('min_tread_depth', 1.6):
            alerts.append({"type": "TIRE_REPLACEMENT_DUE", "severity": "CRITICAL", "title": f"Tire Replacement Due: {tire.get('serial_number')}", "description": f"Tread depth {tire.get('tread_depth_mm')}mm below minimum {tire.get('min_tread_depth')}mm", "entity_type": "tire", "entity_id": tire.get('id'), "country": tire.get('country'), "id": tire.get('id')})
        next_rotation = tire.get('next_rotation_due')
        if next_rotation:
            if isinstance(next_rotation, str):
                next_rotation = datetime.fromisoformat(next_rotation.replace('Z', '+00:00'))
            if next_rotation < now:
                alerts.append({"type": "TIRE_ROTATION_DUE", "severity": "WARNING", "title": f"Tire Rotation Due: {tire.get('serial_number')}", "description": "Rotation overdue", "entity_type": "tire", "entity_id": tire.get('id'), "country": tire.get('country'), "id": tire.get('id')})

    pending_count = await db.maintenance_requests.count_documents({**country_filter, "status": "PENDING"})
    if pending_count > 0:
        alerts.append({"type": "MAINTENANCE_DUE", "severity": "INFO", "title": f"{pending_count} Pending Maintenance Requests", "description": "Maintenance requests awaiting approval", "entity_type": "maintenance_request", "entity_id": None, "country": country, "id": "pending-maintenance"})

    severity_order = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}
    alerts.sort(key=lambda x: severity_order.get(x['severity'], 3))
    return {
        "alerts": alerts, "total_count": len(alerts),
        "critical_count": len([a for a in alerts if a['severity'] == 'CRITICAL']),
        "warning_count": len([a for a in alerts if a['severity'] == 'WARNING']),
        "info_count": len([a for a in alerts if a['severity'] == 'INFO'])
    }


@router.get("/dashboard/compliance")
async def get_compliance_status(country: Optional[str] = None):
    """Get compliance status for all vehicles and drivers"""
    country_filter = {"country": country} if country else {}
    now = datetime.now(timezone.utc)
    compliance_items = []
    vehicles = await db.vehicles.find(country_filter, {"_id": 0}).to_list(1000)
    for vehicle in vehicles:
        vehicle_docs = await db.documents.find({"vehicle_id": vehicle['id']}, {"_id": 0}).to_list(100)
        required_docs = ['ROADWORTHY_CERT', 'INSURANCE', 'VEHICLE_REGISTRATION']
        for doc_type in required_docs:
            doc = next((d for d in vehicle_docs if d.get('document_type') == doc_type), None)
            if not doc:
                compliance_items.append({"entity_type": "vehicle", "entity_id": vehicle['id'], "entity_name": vehicle.get('registration_number'), "country": vehicle.get('country'), "check_type": doc_type, "status": "NON_COMPLIANT", "message": f"Missing {doc_type.replace('_', ' ').title()}"})
            else:
                expiry = doc.get('expiry_date')
                if expiry:
                    if isinstance(expiry, str):
                        expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
                    days_until = (expiry - now).days
                    if days_until < 0:
                        status, message = "NON_COMPLIANT", f"{doc_type.replace('_', ' ').title()} expired"
                    elif days_until <= 30:
                        status, message = "WARNING", f"{doc_type.replace('_', ' ').title()} expires in {days_until} days"
                    else:
                        status, message = "COMPLIANT", f"{doc_type.replace('_', ' ').title()} valid until {expiry.strftime('%Y-%m-%d')}"
                    compliance_items.append({"entity_type": "vehicle", "entity_id": vehicle['id'], "entity_name": vehicle.get('registration_number'), "country": vehicle.get('country'), "check_type": doc_type, "status": status, "message": message, "expiry_date": expiry.isoformat() if expiry else None, "days_until_expiry": days_until})

    compliant = len([c for c in compliance_items if c['status'] == 'COMPLIANT'])
    warning = len([c for c in compliance_items if c['status'] == 'WARNING'])
    non_compliant = len([c for c in compliance_items if c['status'] == 'NON_COMPLIANT'])
    return {
        "items": compliance_items,
        "summary": {
            "compliant": compliant, "warning": warning, "non_compliant": non_compliant,
            "total": len(compliance_items),
            "compliance_rate": round((compliant / len(compliance_items) * 100) if compliance_items else 100, 1)
        }
    }

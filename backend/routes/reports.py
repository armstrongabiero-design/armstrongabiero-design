"""Report routes"""
from fastapi import APIRouter, Depends
from typing import Optional
from datetime import datetime, timezone, timedelta

from database import db
from auth_service import require_group_manager
from currency_utils import currency_converter
import email_service

from .dashboard import get_dashboard_stats, get_dashboard_alerts, get_compliance_status

router = APIRouter()


@router.get("/reports/expense-breakdown")
async def get_expense_breakdown(country: Optional[str] = None, period_days: int = 30):
    start_date = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    country_filter = {"country": country} if country else {}
    expenditures = await db.expenditures.find({**country_filter, "date": {"$gte": start_date}}, {"_id": 0}).to_list(1000)
    breakdown = {}
    for exp in expenditures:
        category = exp.get('category', 'OTHER')
        if category not in breakdown:
            breakdown[category] = {"count": 0, "total_usd": 0}
        breakdown[category]['count'] += 1
        breakdown[category]['total_usd'] += exp.get('amount_usd', 0)
    fuel_txns = await db.fuel_transactions.find({**country_filter, "date": {"$gte": start_date}}, {"_id": 0, "cost_usd": 1}).to_list(1000)
    breakdown['FUEL'] = {"count": len(fuel_txns), "total_usd": round(sum(f.get('cost_usd', 0) for f in fuel_txns), 2)}
    maintenance = await db.maintenance_records.find({**country_filter, "date": {"$gte": start_date}}, {"_id": 0, "cost_usd": 1}).to_list(1000)
    breakdown['MAINTENANCE'] = {"count": len(maintenance), "total_usd": round(sum(m.get('cost_usd', 0) for m in maintenance), 2)}
    for k, v in breakdown.items():
        v['total_usd'] = round(v['total_usd'], 2)
    total = sum(v['total_usd'] for v in breakdown.values())
    return {"period_days": period_days, "country": country, "breakdown": breakdown, "total_usd": round(total, 2)}


@router.get("/reports/utilization")
async def get_utilization_report(country: Optional[str] = None, period_days: int = 30):
    start_date = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    country_filter = {"country": country} if country else {}
    vehicles = await db.vehicles.find(country_filter, {"_id": 0}).to_list(1000)
    utilization_data = []
    for vehicle in vehicles:
        logbook = await db.driver_logbook.find({"vehicle_id": vehicle['id'], "date": {"$gte": start_date}}, {"_id": 0}).to_list(1000)
        total_distance = sum(e.get('distance_km', 0) for e in logbook)
        total_hours = sum(e.get('total_hours', 0) for e in logbook)
        trip_count = len(logbook)
        max_hours = period_days * 8
        utilization_rate = (total_hours / max_hours * 100) if max_hours > 0 else 0
        utilization_data.append({"vehicle_id": vehicle['id'], "registration_number": vehicle.get('registration_number'), "country": vehicle.get('country'), "status": vehicle.get('status'), "trip_count": trip_count, "total_distance_km": round(total_distance, 2), "total_hours": round(total_hours, 2), "utilization_rate": round(utilization_rate, 1)})
    utilization_data.sort(key=lambda x: x['utilization_rate'], reverse=True)
    return {
        "period_days": period_days, "country": country, "vehicle_count": len(vehicles),
        "vehicles": utilization_data,
        "fleet_avg_utilization": round(sum(v['utilization_rate'] for v in utilization_data) / len(utilization_data) if utilization_data else 0, 1)
    }


@router.post("/reports/send-daily")
async def send_daily_report(current_user: dict = Depends(require_group_manager())):
    from datetime import date
    stats = await get_dashboard_stats()
    alerts_data = await get_dashboard_alerts()
    compliance_data = await get_compliance_status()
    pending_users = await db.users.count_documents({"is_approved": False})
    report_data = {
        "date": date.today().strftime("%B %d, %Y"),
        "total_vehicles": stats.get('total_vehicles', 0), "active_vehicles": stats.get('active_vehicles', 0),
        "total_drivers": stats.get('total_drivers', 0), "pending_maintenance": stats.get('pending_maintenance', 0),
        "pending_requests": stats.get('pending_requests', 0), "pending_users": pending_users,
        "alert_count": alerts_data.get('total_count', 0), "alerts": alerts_data.get('alerts', [])[:10],
        "compliance": compliance_data.get('summary', {}),
        "maintenance_cost_ghs": stats.get('total_maintenance_cost_ghs', 0),
        "fuel_cost_usd": stats.get('total_fuel_cost_usd', 0),
        "ghs_rate": stats.get('ghs_exchange_rate', 12.0),
    }
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0, "email": 1})
    if user and user.get('email'):
        success = email_service.send_daily_fleet_report(user['email'], report_data)
        if success:
            return {"status": "success", "message": f"Daily report sent to {user['email']}"}
        else:
            return {"status": "info", "message": "Email service not configured. Report generated but not sent."}
    return {"status": "error", "message": "User email not found"}


@router.post("/reports/send-weekly")
async def send_weekly_report(current_user: dict = Depends(require_group_manager())):
    from datetime import date, timedelta as td
    today = date.today()
    week_start = today - td(days=today.weekday())
    week_end = week_start + td(days=6)
    start_date = week_start.isoformat()
    trips = await db.driver_logbook.count_documents({"date": {"$gte": start_date}})
    logbook_entries = await db.driver_logbook.find({"date": {"$gte": start_date}}, {"_id": 0, "distance_km": 1, "speed_limit_violations": 1}).to_list(1000)
    total_distance = sum(e.get('distance_km', 0) for e in logbook_entries)
    speed_violations = sum(e.get('speed_limit_violations', 0) for e in logbook_entries)
    maintenance_completed = await db.maintenance_records.count_documents({"completed_date": {"$gte": start_date}})
    checklists = await db.pretrip_checklists.count_documents({"date": {"$gte": start_date}})
    fuel_txns = await db.fuel_transactions.find({"date": {"$gte": start_date}}, {"_id": 0, "cost_usd": 1}).to_list(1000)
    fuel_cost_usd = sum(f.get('cost_usd', 0) for f in fuel_txns)
    ghs_rate = 12.0
    maintenance_records = await db.maintenance_records.find({"date": {"$gte": start_date}}, {"_id": 0, "cost_usd": 1}).to_list(1000)
    maintenance_cost_usd = sum(m.get('cost_usd', 0) for m in maintenance_records)
    utilization_data = await get_utilization_report(period_days=7)
    drivers = await db.drivers.find({}, {"_id": 0, "safety_score": 1}).to_list(1000)
    avg_safety = sum(d.get('safety_score', 80) for d in drivers) / len(drivers) if drivers else 80
    report_data = {
        "week_start": week_start.strftime("%B %d, %Y"), "week_end": week_end.strftime("%B %d, %Y"),
        "generated_date": today.strftime("%B %d, %Y"), "trips_completed": trips,
        "distance_km": total_distance, "maintenance_completed": maintenance_completed,
        "fuel_cost_ghs": round(fuel_cost_usd * ghs_rate, 2),
        "maintenance_cost_ghs": round(maintenance_cost_usd * ghs_rate, 2),
        "total_cost_ghs": round((fuel_cost_usd + maintenance_cost_usd) * ghs_rate, 2),
        "avg_utilization": utilization_data.get('fleet_avg_utilization', 0),
        "speed_violations": speed_violations, "checklists_completed": checklists,
        "avg_safety_score": round(avg_safety, 0),
    }
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0, "email": 1})
    if user and user.get('email'):
        success = email_service.send_weekly_summary_report(user['email'], report_data)
        if success:
            return {"status": "success", "message": f"Weekly report sent to {user['email']}"}
        else:
            return {"status": "info", "message": "Email service not configured. Report generated but not sent.", "report_data": report_data}
    return {"status": "error", "message": "User email not found"}

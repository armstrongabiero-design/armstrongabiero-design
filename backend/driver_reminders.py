"""Daily logbook + pre-trip reminder engine (email + in-app)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from country_utils import country_filter_query, normalize_country_code
from models.reminders import (
    COUNTRY_TIMEZONES,
    DriverNotification,
    DriverReminderCountrySettings,
    DriverReminderSettings,
    default_country_settings,
)

logger = logging.getLogger(__name__)

SETTINGS_DOC_ID = "driver_daily_reminders"


def _tz(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("UTC")


def local_now(tz_name: str) -> datetime:
    return datetime.now(_tz(tz_name))


def local_day_bounds_utc(tz_name: str, when: Optional[datetime] = None) -> Tuple[datetime, datetime, str]:
    """Return (start_utc, end_utc, local_date_str) for the local calendar day."""
    now_local = when or local_now(tz_name)
    if now_local.tzinfo is None:
        now_local = now_local.replace(tzinfo=_tz(tz_name))
    else:
        now_local = now_local.astimezone(_tz(tz_name))
    start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    local_date = start_local.date().isoformat()
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc), local_date


async def get_or_create_settings(db) -> DriverReminderSettings:
    doc = await db.system_settings.find_one({"id": SETTINGS_DOC_ID}, {"_id": 0})
    if doc:
        return DriverReminderSettings(**doc)

    defaults = [
        default_country_settings("GH"),
        default_country_settings("LR"),
        default_country_settings("ST"),
    ]
    settings = DriverReminderSettings(id=SETTINGS_DOC_ID, countries=defaults)
    payload = settings.model_dump()
    payload["updated_at"] = settings.updated_at.isoformat()
    await db.system_settings.insert_one(payload)
    return settings


async def save_settings(db, settings: DriverReminderSettings, updated_by: Optional[str] = None) -> DriverReminderSettings:
    settings.updated_at = datetime.now(timezone.utc)
    settings.updated_by = updated_by
    settings.id = SETTINGS_DOC_ID
    payload = settings.model_dump()
    payload["updated_at"] = settings.updated_at.isoformat()
    await db.system_settings.update_one(
        {"id": SETTINGS_DOC_ID},
        {"$set": payload},
        upsert=True,
    )
    return settings


def should_fire_now(cfg: DriverReminderCountrySettings, now_local: datetime) -> bool:
    if not cfg.enabled:
        return False
    if cfg.skip_non_working_days and now_local.weekday() not in (cfg.working_days or []):
        return False

    at_slot = now_local.hour == cfg.reminder_hour and now_local.minute == cfg.reminder_minute
    if at_slot:
        return True
    if cfg.hourly_repeat_enabled and now_local.hour > cfg.reminder_hour and now_local.minute == 0:
        # After initial reminder time, fire at the top of each hour
        return True
    if cfg.hourly_repeat_enabled and now_local.hour == cfg.reminder_hour and now_local.minute == 0:
        return True
    return False


async def driver_completed_today(
    db,
    driver_id: str,
    vehicle_id: str,
    start_utc: datetime,
    end_utc: datetime,
) -> Tuple[bool, bool]:
    """Return (pretrip_done, logbook_done) for local day window."""
    pretrip = await db.pretrip_checklists.find_one(
        {
            "driver_id": driver_id,
            "vehicle_id": vehicle_id,
            "date": {"$gte": start_utc.isoformat(), "$lt": end_utc.isoformat()},
        },
        {"_id": 0, "id": 1},
    )
    # Also accept date stored as date-only string
    if not pretrip:
        local_date = start_utc.astimezone(timezone.utc)  # fallback
        # Try matching date field as YYYY-MM-DD prefix via range already; also check completed flag any
        pretrip = await db.pretrip_checklists.find_one(
            {
                "driver_id": driver_id,
                "vehicle_id": vehicle_id,
                "$or": [
                    {"date": {"$gte": start_utc.isoformat(), "$lt": end_utc.isoformat()}},
                    {"completed": True, "created_at": {"$gte": start_utc.isoformat(), "$lt": end_utc.isoformat()}},
                ],
            },
            {"_id": 0, "id": 1},
        )

    logbook = await db.driver_logbook.find_one(
        {
            "driver_id": driver_id,
            "vehicle_id": vehicle_id,
            "$or": [
                {"date": {"$gte": start_utc.isoformat(), "$lt": end_utc.isoformat()}},
                {"created_at": {"$gte": start_utc.isoformat(), "$lt": end_utc.isoformat()}},
            ],
        },
        {"_id": 0, "id": 1},
    )
    # Logbook dates are often date-only strings YYYY-MM-DD
    if not logbook:
        # Derive local date string from start_utc in UTC — caller should pass local_date
        pass

    return bool(pretrip), bool(logbook)


async def driver_completed_for_local_date(
    db,
    driver_id: str,
    vehicle_id: str,
    local_date: str,
    start_utc: datetime,
    end_utc: datetime,
) -> Tuple[bool, bool]:
    pretrip = await db.pretrip_checklists.find_one(
        {
            "driver_id": driver_id,
            "vehicle_id": vehicle_id,
            "$or": [
                {"date": {"$gte": start_utc.isoformat(), "$lt": end_utc.isoformat()}},
                {"date": {"$regex": f"^{local_date}"}},
            ],
        },
        {"_id": 0, "id": 1},
    )
    logbook = await db.driver_logbook.find_one(
        {
            "driver_id": driver_id,
            "vehicle_id": vehicle_id,
            "$or": [
                {"date": local_date},
                {"date": {"$regex": f"^{local_date}"}},
                {"date": {"$gte": start_utc.isoformat(), "$lt": end_utc.isoformat()}},
                {"created_at": {"$gte": start_utc.isoformat(), "$lt": end_utc.isoformat()}},
            ],
        },
        {"_id": 0, "id": 1},
    )
    return bool(pretrip), bool(logbook)


async def _already_sent_this_slot(
    db,
    driver_id: str,
    local_date: str,
    slot_key: str,
) -> bool:
    existing = await db.reminder_send_log.find_one(
        {"driver_id": driver_id, "local_date": local_date, "slot_key": slot_key},
        {"_id": 1},
    )
    return existing is not None


async def _mark_sent(db, driver_id: str, local_date: str, slot_key: str) -> None:
    await db.reminder_send_log.insert_one(
        {
            "driver_id": driver_id,
            "local_date": local_date,
            "slot_key": slot_key,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }
    )


async def _create_in_app(
    db,
    driver: Dict[str, Any],
    user_id: Optional[str],
    local_date: str,
    missing: List[str],
) -> None:
    title = "Daily compliance reminder"
    missing_label = " and ".join(missing)
    message = (
        f"Please complete your {missing_label} for today ({local_date}). "
        "This reminder stops once both Daily Logbook and Pre-Trip Checklist are done."
    )
    notif = DriverNotification(
        driver_id=driver["id"],
        user_id=user_id,
        country=driver.get("country"),
        title=title,
        message=message,
        local_date=local_date,
    )
    doc = notif.model_dump()
    doc["created_at"] = notif.created_at.isoformat()
    await db.driver_notifications.insert_one(doc)


async def run_reminder_pass(db, email_service, frontend_url: str = "") -> Dict[str, Any]:
    """Evaluate all country configs and notify incomplete drivers. Safe to call every minute."""
    settings = await get_or_create_settings(db)
    stats = {"checked_countries": 0, "reminders_sent": 0, "skipped_complete": 0, "skipped_slot": 0}

    for cfg in settings.countries:
        try:
            country = normalize_country_code(cfg.country)
        except ValueError:
            continue

        tz_name = cfg.timezone or COUNTRY_TIMEZONES.get(country, "UTC")
        now_local = local_now(tz_name)
        # Fire only within the matching minute (loop may run once per minute)
        if not should_fire_now(cfg, now_local):
            continue

        stats["checked_countries"] += 1
        start_utc, end_utc, local_date = local_day_bounds_utc(tz_name, now_local)
        slot_key = f"{now_local.hour:02d}:{now_local.minute:02d}"

        country_q = country_filter_query(country)
        drivers = await db.drivers.find(
            {**country_q, "assigned_vehicle_id": {"$exists": True, "$nin": [None, ""]}},
            {"_id": 0},
        ).to_list(5000)

        for driver in drivers:
            driver_id = driver.get("id")
            vehicle_id = driver.get("assigned_vehicle_id")
            if not driver_id or not vehicle_id:
                continue

            if await _already_sent_this_slot(db, driver_id, local_date, slot_key):
                stats["skipped_slot"] += 1
                continue

            pretrip_done, logbook_done = await driver_completed_for_local_date(
                db, driver_id, vehicle_id, local_date, start_utc, end_utc
            )
            if pretrip_done and logbook_done:
                stats["skipped_complete"] += 1
                continue

            missing = []
            if not pretrip_done:
                missing.append("Pre-Trip Checklist")
            if not logbook_done:
                missing.append("Daily Logbook")

            user = await db.users.find_one(
                {"$or": [{"driver_id": driver_id}, {"id": driver_id}], "role": "DRIVER"},
                {"_id": 0, "id": 1, "email": 1},
            )
            user_id = user.get("id") if user else None
            email = (driver.get("email") or (user or {}).get("email") or "").strip()

            await _create_in_app(db, driver, user_id, local_date, missing)

            if email and email_service:
                name = f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip() or "Driver"
                login_hint = frontend_url or "the GTI Fleet app"
                email_service.send_daily_compliance_reminder(
                    email,
                    {
                        "driver_name": name,
                        "local_date": local_date,
                        "missing": missing,
                        "login_url": login_hint,
                    },
                )

            await _mark_sent(db, driver_id, local_date, slot_key)
            stats["reminders_sent"] += 1

    return stats

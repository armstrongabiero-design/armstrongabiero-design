"""Driving metrics for one vehicle: GPS figures from ProTrack plus the logbook.

GPS figures are worked out per calendar day (UTC, which is local time in Ghana, Liberia and
São Tomé) from ProTrack's route history and kept in `gps_daily_stats`. A finished day never
changes, so it is fetched once; today is refreshed at most every few minutes. A background job
fills recent days for every linked tracker, so most requests only read the cache.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import protrack_client
import tracking_service
from protrack_client import ProTrackError, ProTrackNotConfigured

logger = logging.getLogger(__name__)

PERIODS = (7, 30)
SPEEDING_KMH = 100        # red on the route replay
FAST_KMH = 60             # amber on the route replay
MAX_GAP_SECONDS = 600     # a longer gap between points is a tracker pause, not driving
TODAY_REFRESH_SECONDS = 5 * 60
DAY_SETTLE_SECONDS = 2 * 3600  # trackers upload late points; a day is final 2 h after midnight

REQUEST_BUDGET_SECONDS = 20  # how long one page load may spend fetching missing days
REQUEST_CONCURRENCY = 3
BACKFILL_DAYS = 30
BACKFILL_PER_RUN = 60
BACKFILL_INTERVAL_SECONDS = 3600
BACKFILL_LEASE = "gps_metrics_backfill"

Point = Tuple[float, float, int, float, float]  # lat, lng, unix time, speed km/h, course


def _is_night(unix_time: int) -> bool:
    """22:00 to 05:00 local time (UTC in all three countries)."""
    hour = datetime.fromtimestamp(unix_time, tz=timezone.utc).hour
    return hour >= 22 or hour < 5


def day_stats(points: List[Point]) -> Dict[str, Any]:
    """Figures for one day of GPS points, in time order."""
    distance = 0.0
    moving = speeding = fast = night = 0
    speeding_events = 0
    in_speeding = False
    for index in range(1, len(points)):
        prev, point = points[index - 1], points[index]
        gap = point[2] - prev[2]
        if not 0 < gap <= MAX_GAP_SECONDS:
            in_speeding = False
            continue
        distance += tracking_service.haversine_km(prev, point)
        if prev[3] >= tracking_service.MOVING_SPEED_KMH:
            moving += gap
            if _is_night(prev[2]):
                night += gap
        if prev[3] >= SPEEDING_KMH:
            speeding += gap
        elif prev[3] >= FAST_KMH:
            fast += gap
    for point in points:
        if point[3] >= SPEEDING_KMH and not in_speeding:
            speeding_events += 1
        in_speeding = point[3] >= SPEEDING_KMH
    summary = tracking_service.summarize_route(points)
    return {
        "distance_km": round(distance, 1),
        "moving_minutes": round(moving / 60),
        "max_speed_kmh": round(max((p[3] for p in points), default=0)),
        "speeding_minutes": round(speeding / 60, 1),
        "speeding_events": speeding_events,
        "fast_minutes": round(fast / 60, 1),
        "night_minutes": round(night / 60),
        "stops": len(summary["stops"]),
        "stopped_minutes": sum(s["minutes"] for s in summary["stops"]),
        "points": len(points),
    }


def _day_bounds(day: date) -> Tuple[int, int]:
    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    return int(start.timestamp()), int((start + timedelta(days=1)).timestamp()) - 1


def _doc_id(imei: str, day: date) -> str:
    return f"{imei}:{day.isoformat()}"


async def _compute_day(db, imei: str, day: date) -> Dict[str, Any]:
    begin, end = _day_bounds(day)
    now = int(time.time())
    route = await tracking_service.fetch_route(db, imei, begin, min(end, now))
    points = [tuple(p) for p in route["points"]]
    stats = day_stats(points)
    final = now > end + DAY_SETTLE_SECONDS
    doc = {
        "_id": _doc_id(imei, day),
        "imei": imei,
        "day": day.isoformat(),
        "final": final and not route.get("truncated"),
        "truncated": bool(route.get("truncated")),
        "computed_at": datetime.now(timezone.utc).isoformat(),
        **stats,
    }
    await db.gps_daily_stats.replace_one({"_id": doc["_id"]}, doc, upsert=True)
    return doc


def _is_fresh(doc: Optional[Dict[str, Any]]) -> bool:
    if not doc:
        return False
    if doc.get("final"):
        return True
    computed = tracking_service._parse_iso(doc.get("computed_at"))
    return bool(computed) and time.time() - computed.timestamp() < TODAY_REFRESH_SECONDS


def _period_days(days: int, today: Optional[date] = None) -> List[date]:
    today = today or datetime.now(timezone.utc).date()
    return [today - timedelta(days=offset) for offset in range(days - 1, -1, -1)]


async def gps_metrics(db, imei: str, days: int) -> Dict[str, Any]:
    """GPS figures for the last `days` days, today included.

    Days not yet in the cache are fetched within a time budget. Any left over are reported in
    `missing_days`; the background job fills them, so a later visit shows the full period.
    """
    wanted = _period_days(days)
    cached = {
        doc["day"]: doc
        for doc in await db.gps_daily_stats.find(
            {"_id": {"$in": [_doc_id(imei, d) for d in wanted]}}
        ).to_list(len(wanted))
    }
    stale = [d for d in reversed(wanted) if not _is_fresh(cached.get(d.isoformat()))]  # newest first
    error: Optional[str] = None

    if stale and protrack_client.is_configured():
        deadline = time.monotonic() + REQUEST_BUDGET_SECONDS
        semaphore = asyncio.Semaphore(REQUEST_CONCURRENCY)
        failure: List[ProTrackError] = []

        async def fill(day: date) -> None:
            async with semaphore:
                if failure or time.monotonic() > deadline:
                    return
                try:
                    cached[day.isoformat()] = await _compute_day(db, imei, day)
                except ProTrackError as exc:
                    failure.append(exc)

        await asyncio.gather(*(fill(d) for d in stale))
        if failure:
            error = str(failure[0])
            logger.warning("GPS metrics fetch stopped: %s (code %s)", failure[0], failure[0].code)

    daily = []
    missing = []
    for day in wanted:
        doc = cached.get(day.isoformat())
        if not doc:
            missing.append(day.isoformat())
            continue
        daily.append({k: doc.get(k) for k in (
            "day", "distance_km", "moving_minutes", "max_speed_kmh", "speeding_minutes",
            "speeding_events", "fast_minutes", "night_minutes", "stops", "stopped_minutes",
        )})
    totals = _totals(daily)
    return {"daily": daily, "totals": totals, "missing_days": missing, "error": error}


def _totals(daily: List[Dict[str, Any]]) -> Dict[str, Any]:
    def total(key):
        return sum(d.get(key) or 0 for d in daily)

    distance = total("distance_km")
    moving_minutes = total("moving_minutes")
    speeding_events = total("speeding_events")
    return {
        "distance_km": round(distance, 1),
        "moving_minutes": moving_minutes,
        "days_driven": sum(1 for d in daily if (d.get("distance_km") or 0) >= 1),
        "max_speed_kmh": max((d.get("max_speed_kmh") or 0 for d in daily), default=0),
        "avg_moving_speed_kmh": round(distance / (moving_minutes / 60), 1) if moving_minutes else 0,
        "speeding_minutes": round(total("speeding_minutes"), 1),
        "speeding_events": speeding_events,
        "speeding_per_100km": round(speeding_events / distance * 100, 1) if distance >= 1 else 0,
        "fast_minutes": round(total("fast_minutes"), 1),
        "night_minutes": total("night_minutes"),
        "stops": total("stops"),
        "stopped_minutes": total("stopped_minutes"),
    }


async def logbook_metrics(db, vehicle_id: str, days: int) -> Dict[str, Any]:
    """Logbook figures for a vehicle over the period, in total and per driver."""
    from driver_profile_service import resolve_driver_display_names

    since = datetime.combine(_period_days(days)[0], datetime.min.time(), tzinfo=timezone.utc).isoformat()
    entries = await db.driver_logbook.find(
        {"vehicle_id": vehicle_id, "date": {"$gte": since}}, {"_id": 0}
    ).to_list(5000)
    per_driver: Dict[str, Dict[str, Any]] = {}
    for entry in entries:
        key = entry.get("driver_id") or "unknown"
        row = per_driver.setdefault(key, {
            "driver_id": entry.get("driver_id"), "trips": 0, "distance_km": 0.0, "fuel_liters": 0.0,
            "speed_violations": 0, "harsh_braking_events": 0, "harsh_acceleration_events": 0,
            "idle_minutes": 0, "last_trip_at": None,
        })
        row["trips"] += 1
        row["distance_km"] += entry.get("distance_km") or 0
        row["fuel_liters"] += entry.get("fuel_used_liters") or 0
        row["speed_violations"] += entry.get("speed_limit_violations") or 0
        row["harsh_braking_events"] += entry.get("harsh_braking_events") or 0
        row["harsh_acceleration_events"] += entry.get("harsh_acceleration_events") or 0
        row["idle_minutes"] += entry.get("idle_time_minutes") or 0
        started = str(entry.get("start_time") or entry.get("date") or "")
        if started and (not row["last_trip_at"] or started > row["last_trip_at"]):
            row["last_trip_at"] = started

    names = await resolve_driver_display_names(db, [r["driver_id"] for r in per_driver.values() if r["driver_id"]])
    drivers = []
    for row in per_driver.values():
        row["driver_name"] = names.get(row["driver_id"]) or "Unknown driver"
        row["distance_km"] = round(row["distance_km"], 1)
        row["fuel_liters"] = round(row["fuel_liters"], 1)
        row["fuel_efficiency_km_per_l"] = (
            round(row["distance_km"] / row["fuel_liters"], 1) if row["fuel_liters"] > 0 else None
        )
        drivers.append(row)
    drivers.sort(key=lambda r: r["last_trip_at"] or "", reverse=True)

    def total(key):
        return sum(r[key] for r in drivers)

    distance, fuel = total("distance_km"), total("fuel_liters")
    return {
        "totals": {
            "trips": total("trips"),
            "distance_km": round(distance, 1),
            "fuel_liters": round(fuel, 1),
            "fuel_efficiency_km_per_l": round(distance / fuel, 1) if fuel > 0 else None,
            "speed_violations": total("speed_violations"),
            "harsh_braking_events": total("harsh_braking_events"),
            "harsh_acceleration_events": total("harsh_acceleration_events"),
            "idle_minutes": total("idle_minutes"),
        },
        "drivers": drivers,
    }


async def backfill_once(db) -> int:
    """Fill missing or stale recent days for every linked tracker. Returns days fetched."""
    if not protrack_client.is_configured():
        return 0
    status = await db.integration_status.find_one({"_id": tracking_service.STATUS_ID}) or {}
    if status.get("backoff_until", 0) > time.time():
        return 0  # the live poll is backing off from ProTrack; do not add load
    if not await protrack_client.acquire_lease(db, BACKFILL_LEASE, BACKFILL_INTERVAL_SECONDS - 60):
        return 0
    trackers = await db.trackers.find(
        {"vehicle_id": {"$nin": [None, ""]}}, {"_id": 0, "imei": 1}
    ).to_list(1000)
    wanted = _period_days(BACKFILL_DAYS)[:-1]  # finished days only; today is fetched on demand
    done = 0
    for tracker in trackers:
        imei = tracker["imei"]
        have = {
            doc["day"]
            for doc in await db.gps_daily_stats.find(
                {"imei": imei, "final": True, "day": {"$gte": wanted[0].isoformat()}}, {"day": 1}
            ).to_list(BACKFILL_DAYS)
        }
        for day in reversed(wanted):
            if day.isoformat() in have:
                continue
            if done >= BACKFILL_PER_RUN:
                return done
            try:
                await _compute_day(db, imei, day)
            except ProTrackError as exc:
                logger.warning("GPS metrics backfill paused: %s (code %s)", exc, exc.code)
                return done
            done += 1
    return done


async def backfill_loop(db) -> None:
    await asyncio.sleep(120)  # let the live poll start first
    while True:
        try:
            await backfill_once(db)
        except ProTrackNotConfigured:
            pass
        except Exception:
            logger.exception("GPS metrics backfill failed")
        await asyncio.sleep(BACKFILL_INTERVAL_SECONDS)

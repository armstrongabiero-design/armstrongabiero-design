"""Live GPS positions from ProTrack, saved on each vehicle as last_location.

One worker polls at a time (a lease in job_leases). The map reads only our own API, so country
scoping applies exactly as it does for manually entered locations.
"""
from __future__ import annotations

import asyncio
import logging
import math
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

import protrack_client
from protrack_client import ProTrackError, ProTrackNotConfigured

logger = logging.getLogger(__name__)

POLL_SECONDS = 30
DEVICE_SYNC_SECONDS = 10 * 60
TRACK_BATCH = 100  # ProTrack's limit per /api/track call
OFFLINE_AFTER_SECONDS = 15 * 60
MOVING_SPEED_KMH = 5  # below this, GPS drift is treated as standing still
RATE_LIMIT_BACKOFF_SECONDS = 120
CREDENTIAL_BACKOFF_SECONDS = 15 * 60  # do not hammer a wrong password into an account lock

PLAYBACK_PAGE = 1000
MAX_PLAYBACK_PAGES = 30
MAX_ROUTE_DAYS = 7
STOP_MIN_SECONDS = 5 * 60

STATUS_ID = "protrack"

DATA_STATUS = {1: "Never online", 2: "OK", 3: "Subscription expired", 4: "Offline", 5: "Blocked"}


def _iso(unix_seconds: Any) -> Optional[str]:
    try:
        value = int(unix_seconds)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()


def _parse_iso(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def normalize_plate(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def _number(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _valid_position(lat: Any, lng: Any) -> bool:
    lat, lng = _number(lat), _number(lng)
    if lat is None or lng is None:
        return False
    if lat == 0 and lng == 0:
        return False  # trackers report 0,0 before their first fix
    return -90 <= lat <= 90 and -180 <= lng <= 180


def derive_state(record: Dict[str, Any], now: Optional[float] = None) -> Tuple[str, Optional[str]]:
    """MOVING, IDLE (engine on, standing), PARKED (engine off or unknown) or OFFLINE, with a reason."""
    now = time.time() if now is None else now
    data_status = record.get("datastatus")
    if data_status in (1, 3, 4, 5):
        return "OFFLINE", DATA_STATUS[data_status]
    heart = _number(record.get("hearttime")) or 0
    if not heart or now - heart > OFFLINE_AFTER_SECONDS:
        return "OFFLINE", "No signal"
    if (_number(record.get("speed")) or 0) >= MOVING_SPEED_KMH:
        return "MOVING", None
    if record.get("accstatus") == 1:
        return "IDLE", None
    return "PARKED", None


def _tracker_fields(record: Dict[str, Any], now: float) -> Dict[str, Any]:
    state, reason = derive_state(record, now)
    acc = record.get("accstatus")
    battery = _number(record.get("battery"))
    mileage = _number(record.get("mileage"))
    return {
        "source": "GPS",
        "imei": str(record.get("imei")),
        "tracker_state": state,
        "tracker_state_reason": reason,
        "engine_on": True if acc == 1 else False if acc == 0 else None,
        "signal_at": _iso(record.get("hearttime")),
        "battery_percent": battery if battery is not None and battery >= 0 else None,
        "fuel_liters": _number(record.get("fuel")),
        "external_power_volts": _number(record.get("externalpower")),
        "tracker_odometer_km": round(mileage / 1000, 1) if mileage is not None and mileage >= 0 else None,
        "polled_at": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
    }


def merge_location(existing: Optional[Dict[str, Any]], record: Dict[str, Any], country: Any, now: float) -> Dict[str, Any]:
    """New last_location for a vehicle. A newer manual entry keeps its position."""
    existing = dict(existing or {})
    merged = {**existing, **_tracker_fields(record, now)}
    if not _valid_position(record.get("latitude"), record.get("longitude")):
        return merged
    fix_time = _iso(record.get("gpstime")) or _iso(record.get("systemtime"))
    current = _parse_iso(existing.get("timestamp"))
    incoming = _parse_iso(fix_time)
    if existing.get("source") == "MANUAL" and current and incoming and current > incoming:
        merged["source"] = "MANUAL"
        return merged
    merged.update(
        latitude=float(record["latitude"]),
        longitude=float(record["longitude"]),
        speed_kmh=_number(record.get("speed")),
        heading=_number(record.get("course")),
        timestamp=fix_time,
        country=country,
        address=None,
        city=None,
    )
    return merged


async def _set_status(db, **fields: Any) -> None:
    await db.integration_status.update_one({"_id": STATUS_ID}, {"$set": fields}, upsert=True)


async def sync_devices(db) -> Dict[str, int]:
    """Copy ProTrack's tracker list and link new trackers to vehicles with the same plate."""
    body = await protrack_client.call(db, "/api/device/list")
    devices = body.get("record") or []
    vehicles = await db.vehicles.find(
        {}, {"_id": 0, "id": 1, "registration_number": 1, "country": 1}
    ).to_list(10000)
    plates: Dict[str, List[str]] = {}
    for vehicle in vehicles:
        key = normalize_plate(vehicle.get("registration_number"))
        if key:
            plates.setdefault(key, []).append(vehicle["id"])
    existing = {t["imei"]: t for t in await db.trackers.find({}).to_list(10000)}
    taken = {t.get("vehicle_id") for t in existing.values() if t.get("vehicle_id")}
    now_iso = datetime.now(timezone.utc).isoformat()
    linked = 0
    seen = set()
    for device in devices:
        imei = str(device.get("imei") or "").strip()
        if not imei:
            continue
        seen.add(imei)
        fields = {
            "imei": imei,
            "device_name": device.get("devicename") or "",
            "device_type": device.get("devicetype") or "",
            "protrack_plate": device.get("platenumber") or "",
            "platform_expires_at": _iso(device.get("platformduetime")),
            "user_expires_at": _iso(device.get("userduetime")),
            "seen_at": now_iso,
            "missing_from_protrack": False,
        }
        current = existing.get(imei) or {}
        # Only trackers nobody has decided on yet are matched automatically.
        if not current.get("vehicle_id") and not current.get("link_source"):
            matches = plates.get(normalize_plate(fields["protrack_plate"]), [])
            if len(matches) == 1 and matches[0] not in taken:
                fields.update(vehicle_id=matches[0], link_source="auto", confirmed=False, linked_at=now_iso)
                taken.add(matches[0])
                linked += 1
        await db.trackers.update_one({"_id": imei}, {"$set": fields}, upsert=True)
    for imei in set(existing) - seen:
        await db.trackers.update_one({"_id": imei}, {"$set": {"missing_from_protrack": True}})
    await _set_status(db, last_device_sync_at=now_iso, trackers_total=len(seen))
    return {"trackers": len(seen), "auto_linked": linked}


def _batches(items: List[str], size: int) -> Iterable[List[str]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


async def poll_positions(db, now: Optional[float] = None) -> Dict[str, int]:
    now = time.time() if now is None else now
    trackers = await db.trackers.find({"vehicle_id": {"$nin": [None, ""]}}).to_list(10000)
    by_imei = {t["imei"]: t["vehicle_id"] for t in trackers}
    updated = 0
    for batch in _batches(sorted(by_imei), TRACK_BATCH):
        body = await protrack_client.call(db, "/api/track", imeis=",".join(batch))
        for record in body.get("record") or []:
            vehicle_id = by_imei.get(str(record.get("imei")))
            if not vehicle_id:
                continue
            vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "country": 1, "last_location": 1})
            if not vehicle:
                continue
            location = merge_location(vehicle.get("last_location"), record, vehicle.get("country"), now)
            await db.vehicles.update_one({"id": vehicle_id}, {"$set": {"last_location": location}})
            updated += 1
    return {"linked": len(by_imei), "updated": updated}


async def run_cycle(db) -> Optional[Dict[str, Any]]:
    """One polling cycle. Returns None when another worker holds the lease or ProTrack is off."""
    if not protrack_client.is_configured():
        return None
    if not await protrack_client.acquire_lease(db, "protrack_poll", POLL_SECONDS - 5):
        return None
    status = await db.integration_status.find_one({"_id": STATUS_ID}) or {}
    now = time.time()
    if status.get("backoff_until", 0) > now:
        return None
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        result: Dict[str, Any] = {}
        last_sync = _parse_iso(status.get("last_device_sync_at"))
        if not last_sync or now - last_sync.timestamp() > DEVICE_SYNC_SECONDS:
            result.update(await sync_devices(db))
        result.update(await poll_positions(db, now))
        await _set_status(
            db, configured=True, last_attempt_at=now_iso, last_success_at=now_iso,
            last_error=None, backoff_until=0, trackers_linked=result.get("linked", 0),
        )
        return result
    except ProTrackNotConfigured:
        return None
    except ProTrackError as exc:
        backoff = 0
        if exc.code == protrack_client.RATE_LIMITED:
            backoff = RATE_LIMIT_BACKOFF_SECONDS
        elif exc.code in protrack_client.CREDENTIAL_ERRORS:
            backoff = CREDENTIAL_BACKOFF_SECONDS
        await _set_status(
            db, configured=True, last_attempt_at=now_iso,
            last_error={"code": exc.code, "message": str(exc), "at": now_iso},
            backoff_until=now + backoff if backoff else 0,
        )
        logger.warning("ProTrack poll failed: %s (code %s)", exc, exc.code)
        return None


async def tracking_loop(db) -> None:
    await asyncio.sleep(10)
    while True:
        try:
            await run_cycle(db)
        except Exception:
            logger.exception("GPS tracking cycle failed")
        await asyncio.sleep(POLL_SECONDS)


def _error_kind(code: Any) -> str:
    if code in protrack_client.CREDENTIAL_ERRORS:
        return "credentials"
    if code in (-2, -3, -4):
        return "unreachable"
    if code == protrack_client.RATE_LIMITED:
        return "rate_limited"
    return "other"


async def get_status(db) -> Dict[str, Any]:
    status = await db.integration_status.find_one({"_id": STATUS_ID}) or {}
    configured = protrack_client.is_configured()
    last_success = _parse_iso(status.get("last_success_at"))
    if not configured:
        state = "not_configured"
    elif status.get("last_error"):
        state = "error"  # a successful cycle clears it
    elif not last_success:
        state = "starting"
    elif time.time() - last_success.timestamp() > 3 * POLL_SECONDS + 30:
        state = "delayed"
    else:
        state = "ok"
    error = status.get("last_error") or {}
    return {
        "configured": configured,
        "state": state,
        "last_success_at": status.get("last_success_at"),
        "last_device_sync_at": status.get("last_device_sync_at"),
        "trackers_total": status.get("trackers_total", 0),
        "trackers_linked": status.get("trackers_linked", 0),
        "message": error.get("message") if state == "error" else None,
        "error_kind": _error_kind(error.get("code")) if state == "error" else None,
        "poll_seconds": POLL_SECONDS,
    }


# ---------------------------------------------------------------- who is driving

RECENT_DRIVER_HOURS = 24


async def recent_drivers(db, vehicle_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """The latest driver per vehicle from the last day's pre-trip checks and logbook trips.

    Drivers are not assigned to vehicles permanently, so this is the best record of who has it now.
    """
    from driver_profile_service import resolve_driver_display_names

    if not vehicle_ids:
        return {}
    since = (datetime.now(timezone.utc) - timedelta(hours=RECENT_DRIVER_HOURS)).isoformat()
    latest: Dict[str, Dict[str, Any]] = {}
    sources = (
        (db.pretrip_checklists, "created_at", "Pre-trip check"),
        (db.driver_logbook, "start_time", "Logbook trip"),
    )
    for collection, field, label in sources:
        rows = await collection.find(
            {"vehicle_id": {"$in": vehicle_ids}, field: {"$gte": since}},
            {"_id": 0, "vehicle_id": 1, "driver_id": 1, field: 1},
        ).to_list(5000)
        for row in rows:
            at = str(row.get(field) or "")
            current = latest.get(row["vehicle_id"])
            if row.get("driver_id") and (not current or at > current["at"]):
                latest[row["vehicle_id"]] = {"driver_id": row["driver_id"], "source": label, "at": at}
    names = await resolve_driver_display_names(db, [d["driver_id"] for d in latest.values()])
    return {
        vehicle_id: {"driver_name": names.get(d["driver_id"]), "driver_source": d["source"], "driver_seen_at": d["at"]}
        for vehicle_id, d in latest.items()
    }


# ---------------------------------------------------------------- route replay

def _parse_playback(record: str) -> List[Tuple[float, float, int, float, float]]:
    points = []
    for chunk in (record or "").split(";"):
        parts = chunk.split(",")
        if len(parts) < 5:
            continue
        lng, lat, t, speed, course = (_number(p) for p in parts[:5])
        if t is None or not _valid_position(lat, lng):
            continue
        points.append((lat, lng, int(t), speed or 0.0, course or 0.0))
    return points


def haversine_km(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def summarize_route(points: List[Tuple[float, float, int, float, float]]) -> Dict[str, Any]:
    distance = 0.0
    moving_seconds = 0
    stops: List[Dict[str, Any]] = []
    stop_start: Optional[int] = None
    for index, point in enumerate(points):
        if index:
            prev = points[index - 1]
            gap = point[2] - prev[2]
            distance += haversine_km(prev, point)
            if prev[3] >= MOVING_SPEED_KMH and 0 < gap < 600:
                moving_seconds += gap
        if point[3] < MOVING_SPEED_KMH:
            if stop_start is None:
                stop_start = index
        elif stop_start is not None:
            _close_stop(points, stop_start, index - 1, stops)
            stop_start = None
    if stop_start is not None:
        _close_stop(points, stop_start, len(points) - 1, stops)
    return {
        "distance_km": round(distance, 1),
        "max_speed_kmh": max((p[3] for p in points), default=0),
        "moving_minutes": round(moving_seconds / 60),
        "stops": stops,
        "start_at": _iso(points[0][2]) if points else None,
        "end_at": _iso(points[-1][2]) if points else None,
    }


def _close_stop(points, first: int, last: int, stops: List[Dict[str, Any]]) -> None:
    # A stop also covers the gap until the next point, when the tracker may have gone quiet.
    end_time = points[last + 1][2] if last + 1 < len(points) else points[last][2]
    duration = end_time - points[first][2]
    if duration >= STOP_MIN_SECONDS:
        stops.append({
            "latitude": points[first][0],
            "longitude": points[first][1],
            "start_at": _iso(points[first][2]),
            "end_at": _iso(end_time),
            "minutes": round(duration / 60),
        })


async def fetch_route(db, imei: str, begin: int, end: int) -> Dict[str, Any]:
    """All GPS points between two times, following ProTrack's 1,000-point pages."""
    points: List[Tuple[float, float, int, float, float]] = []
    cursor = begin
    truncated = False
    for page in range(MAX_PLAYBACK_PAGES):
        try:
            body = await protrack_client.call(db, "/api/playback", imei=imei, begintime=cursor, endtime=end)
        except ProTrackError as exc:
            if exc.code == 20023:  # no data
                break
            raise
        raw = body.get("record") or ""
        page_points = _parse_playback(raw)
        raw_count = len([c for c in raw.split(";") if c])
        last_time = points[-1][2] if points else None
        points.extend(p for p in page_points if last_time is None or p[2] > last_time)
        if raw_count < PLAYBACK_PAGE or not page_points:
            break
        next_cursor = page_points[-1][2]
        cursor = next_cursor if next_cursor > cursor else cursor + 1
        if page == MAX_PLAYBACK_PAGES - 1:
            truncated = True
    return {
        "points": [[round(p[0], 6), round(p[1], 6), p[2], p[3], p[4]] for p in points],
        "summary": summarize_route(points),
        "truncated": truncated,
    }

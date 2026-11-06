"""A stand-in for the ProTrack365 API, for tests and local development.

Run it next to the API and point PROTRACK_BASE_URL at it:

    uvicorn tests.protrack_mock:app --port 8765          # from backend/
    PROTRACK_BASE_URL=http://127.0.0.1:8765
    PROTRACK_ACCOUNT=mock
    PROTRACK_PASSWORD_MD5=$(printf mockpass | md5)          # md5sum on Linux

Behaves like the real API where it matters: md5 signatures, 2-hour tokens, a new token cancelling
the previous one, 100-IMEI and 1,000-point limits, and ProTrack's error codes. Vehicles drive in
loops around Accra, Monrovia and São Tomé so the map has something to show.

PROTRACK_MOCK_PLATES sets the plate numbers (comma-separated) to match your local vehicles.
"""
from __future__ import annotations

import hashlib
import math
import os
import secrets
import time
from typing import Dict, List, Optional

from fastapi import FastAPI, Query

ACCOUNT = os.environ.get("PROTRACK_MOCK_ACCOUNT", "mock")
PASSWORD = os.environ.get("PROTRACK_MOCK_PASSWORD", "mockpass")
TOKEN_SECONDS = 7200
POINT_INTERVAL = 10  # seconds between recorded GPS points

CITIES = [(5.6037, -0.1870), (6.3156, -10.8074), (0.3365, 6.7273)]


def _city_for(plate: str, index: int):
    """Liberian plates drive in Monrovia, São Tomé plates in São Tomé, the rest in Accra."""
    prefix = plate[:2].upper()
    if prefix.startswith("L"):
        return CITIES[1]
    if prefix.startswith("ST"):
        return CITIES[2]
    return CITIES[0] if prefix.startswith("G") else CITIES[index % len(CITIES)]


def _default_plates() -> List[str]:
    raw = os.environ.get("PROTRACK_MOCK_PLATES", "GR-1234-20,GW-5678-21,LR-A-1001,ST-22-01,GE-9090-22,UNMATCHED-01")
    return [p.strip() for p in raw.split(",") if p.strip()]


class MockState:
    def __init__(self, plates: Optional[List[str]] = None):
        self.plates = plates if plates is not None else _default_plates()
        self.devices = [
            {"imei": f"8600000000{index:05d}", "plate": plate, "city": _city_for(plate, index), "seed": index}
            for index, plate in enumerate(self.plates)
        ]
        self.token: Optional[str] = None
        self.token_expires = 0.0
        self.sign_ins = 0
        self.calls: List[str] = []
        self.fail_next: Optional[int] = None  # force the next call to return this error code

    def reset(self) -> None:
        self.__init__(self.plates)


state = MockState()
app = FastAPI(title="ProTrack mock")


def _error(code: int, message: str = "") -> Dict:
    return {"code": code, "message": message}


def _check_token(access_token: Optional[str]) -> Optional[Dict]:
    if state.fail_next is not None:
        code, state.fail_next = state.fail_next, None
        return _error(code)
    if not access_token:
        return _error(10010, "Access token doesn't exist")
    if access_token != state.token:
        return _error(10011, "Access token is invalid")
    if time.time() > state.token_expires:
        return _error(10012, "Access token is out of date")
    return None


def position(device: Dict, t: float) -> Dict:
    """Deterministic drive: 50 minutes moving round a loop, then 10 minutes parked with the engine off."""
    seed = device["seed"]
    cycle = 3600
    phase = (t + seed * 700) % cycle
    lat0, lng0 = device["city"]
    radius = 0.02 + 0.004 * (seed % 3)
    moving = phase < 3000
    angle = (min(phase, 3000) / 3000) * 2 * math.pi + seed
    lat = lat0 + radius * math.sin(angle)
    lng = lng0 + radius * math.cos(angle)
    speed = int(35 + 30 * abs(math.sin(angle * 3)) + (seed % 2) * 45) if moving else 0
    course = int((math.degrees(angle) + 90) % 360)
    return {"lat": round(lat, 6), "lng": round(lng, 6), "speed": speed, "course": course, "moving": moving}


@app.get("/api/authorization")
def authorization(time_: int = Query(..., alias="time"), account: str = "", signature: str = ""):
    state.calls.append("/api/authorization")
    if abs(time.time() - time_) > 300:
        return _error(10014, "Request time error")
    expected = hashlib.md5(
        (hashlib.md5(PASSWORD.encode()).hexdigest() + str(time_)).encode()
    ).hexdigest()
    if account != ACCOUNT or signature != expected:
        return _error(20001, "Account or password error")
    state.token = secrets.token_hex(16)  # the previous token stops working now
    state.token_expires = time.time() + TOKEN_SECONDS
    state.sign_ins += 1
    return {"code": 0, "record": {"access_token": state.token, "expires_in": TOKEN_SECONDS}}


@app.get("/api/device/list")
def device_list(access_token: Optional[str] = None):
    state.calls.append("/api/device/list")
    if error := _check_token(access_token):
        return error
    return {"code": 0, "record": [
        {"imei": d["imei"], "devicename": f"VT05S-{d['imei'][-5:]}", "devicetype": "VT05S",
         "platenumber": d["plate"], "onlinetime": 1700000000, "platformduetime": 1893456000,
         "simcard": "", "iccid": "", "activatedtime": 1700000000, "userduetime": 1893456000}
        for d in state.devices
    ]}


@app.get("/api/track")
def track(access_token: Optional[str] = None, imeis: str = ""):
    state.calls.append("/api/track")
    if error := _check_token(access_token):
        return error
    wanted = [i for i in imeis.split(",") if i]
    if not wanted:
        return _error(10005, "Missing required parameter")
    if len(wanted) > 100:
        return _error(10006, "The parameter is out of range")
    now = int(time.time())
    records = []
    for device in state.devices:
        if device["imei"] not in wanted:
            continue
        offline = device["seed"] % 6 == 4  # one in six trackers has gone quiet
        seen = now - 3 * 3600 if offline else now - 5
        here = position(device, seen)
        records.append({
            "imei": device["imei"], "servertime": now, "gpstime": seen, "hearttime": seen, "systemtime": seen,
            "latitude": here["lat"], "longitude": here["lng"], "course": here["course"], "speed": here["speed"],
            "acctime": 600, "accstatus": 1 if here["moving"] or device["seed"] % 4 == 1 else 0,
            "doorstatus": -1, "chargestatus": -1, "oilpowerstatus": 1, "defencestatus": -1,
            "datastatus": 4 if offline else 2, "battery": 87, "mileage": 152340000 + device["seed"] * 1000000,
            "todaymileage": 84000, "externalpower": "12.6", "fuel": "", "fueltime": 0,
            "temperature": [], "temperaturetime": 0,
        })
    return {"code": 0, "record": records}


@app.get("/api/playback")
def playback(access_token: Optional[str] = None, imei: str = "", begintime: int = 0, endtime: int = 0):
    state.calls.append("/api/playback")
    if error := _check_token(access_token):
        return error
    device = next((d for d in state.devices if d["imei"] == imei), None)
    if not device:
        return _error(20005, "Target doesn't exist.")
    if endtime <= begintime:
        return _error(10006, "The parameter is out of range")
    points = []
    # Recorded points fall on a fixed 10-second grid. The begin time is inclusive, so the next
    # page repeats the previous page's last point, as the real API does.
    t = begintime + (-begintime % POINT_INTERVAL)
    while t <= endtime and len(points) < 1000:
        here = position(device, t)
        points.append(f"{here['lng']},{here['lat']},{t},{here['speed']},{here['course']}")
        t += POINT_INTERVAL
    if not points:
        return _error(20023, "No Data.")
    return {"code": 0, "record": ";".join(points)}


@app.get("/api/command/send")
def command_send():
    # Present so tests can prove the client never calls it.
    state.calls.append("/api/command/send")
    return {"code": 0, "record": {"commandid": "X"}}

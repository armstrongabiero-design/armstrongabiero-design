"""GPS tracking: the ProTrack client against the mock API, plus the map's routes and access rules."""
from __future__ import annotations

import asyncio
import hashlib
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import protrack_client
import tracking_service
from tests import protrack_mock
from tests.test_authorization import auth, client, fake_db  # noqa: F401  (pytest fixtures)

MOCK_BASE = "http://protrack.mock"


@pytest.fixture()
def protrack(monkeypatch, fake_db):
    monkeypatch.setenv("PROTRACK_BASE_URL", MOCK_BASE)
    monkeypatch.setenv("PROTRACK_ACCOUNT", protrack_mock.ACCOUNT)
    monkeypatch.setenv("PROTRACK_PASSWORD_MD5", hashlib.md5(protrack_mock.PASSWORD.encode()).hexdigest())
    protrack_mock.state.plates = ["GH-1", "LR 1", "UNKNOWN-9"]
    protrack_mock.state.reset()
    mock = TestClient(protrack_mock.app)

    def fake_get(url, params):
        assert url.startswith(MOCK_BASE)
        return mock.get(url[len(MOCK_BASE):], params=params).json()

    monkeypatch.setattr(protrack_client, "_http_get", fake_get)
    return protrack_mock.state


def run(coro):
    return asyncio.run(coro)


def imei_for(plate):
    return next(d["imei"] for d in protrack_mock.state.devices if d["plate"] == plate)


def free_leases(db):
    db.job_leases.docs.clear()


# ---------------------------------------------------------------- client

def test_signature_matches_protrack_documentation_example():
    password_md5 = hashlib.md5(b"Abc@34590").hexdigest()
    assert protrack_client.make_signature(password_md5, 1556243443) == "3844afd2c3bf68f0f3f4aa0a9ee8ee6c"


def test_workers_share_one_token(protrack, fake_db):
    run(protrack_client.call(fake_db, "/api/device/list"))
    run(protrack_client.call(fake_db, "/api/device/list"))
    assert protrack.sign_ins == 1


def test_token_cancelled_elsewhere_is_renewed_once(protrack, fake_db):
    run(protrack_client.call(fake_db, "/api/device/list"))
    protrack.token = "issued-to-someone-else"
    body = run(protrack_client.call(fake_db, "/api/device/list"))
    assert body["code"] == 0
    assert protrack.sign_ins == 2


def test_old_token_is_renewed_before_protrack_expires_it(protrack, fake_db):
    run(protrack_client.call(fake_db, "/api/device/list"))
    fake_db.integration_tokens.docs[0]["obtained_at"] = time.time() - protrack_client.TOKEN_MAX_AGE_SECONDS - 1
    run(protrack_client.call(fake_db, "/api/device/list"))
    assert protrack.sign_ins == 2


def test_client_refuses_anything_but_read_only_calls(protrack, fake_db):
    for path in ("/api/command/send", "/api/geofence/create", "/api/user/password/set"):
        with pytest.raises(ValueError):
            run(protrack_client.call(fake_db, path))
    assert "/api/command/send" not in protrack.calls


def test_not_configured_does_nothing(monkeypatch, fake_db):
    monkeypatch.delenv("PROTRACK_ACCOUNT", raising=False)
    monkeypatch.delenv("PROTRACK_PASSWORD_MD5", raising=False)
    assert run(tracking_service.run_cycle(fake_db)) is None
    assert run(tracking_service.get_status(fake_db))["state"] == "not_configured"


def test_wrong_password_is_reported_and_backs_off(protrack, fake_db, monkeypatch):
    monkeypatch.setenv("PROTRACK_PASSWORD_MD5", hashlib.md5(b"wrong").hexdigest())
    assert run(tracking_service.run_cycle(fake_db)) is None
    status = run(tracking_service.get_status(fake_db))
    assert status["state"] == "error"
    assert "password" in status["message"]
    assert status["error_kind"] == "credentials"
    calls = len(protrack.calls)
    free_leases(fake_db)
    run(tracking_service.run_cycle(fake_db))
    assert len(protrack.calls) == calls  # backing off, so the account is not locked


def test_rate_limit_backs_off(protrack, fake_db):
    run(protrack_client.get_token(fake_db))
    protrack.fail_next = 10009
    run(tracking_service.run_cycle(fake_db))
    status = fake_db.integration_status.docs[0]
    assert status["backoff_until"] > time.time() + 60


def test_only_one_worker_polls_at_a_time(protrack, fake_db):
    assert run(tracking_service.run_cycle(fake_db)) is not None
    assert run(tracking_service.run_cycle(fake_db)) is None  # second worker, same 30 seconds


# ---------------------------------------------------------------- states and merging

@pytest.mark.parametrize("record,expected", [
    ({"datastatus": 2, "hearttime": 1000, "speed": 40, "accstatus": 1}, "MOVING"),
    ({"datastatus": 2, "hearttime": 1000, "speed": 2, "accstatus": 1}, "IDLE"),
    ({"datastatus": 2, "hearttime": 1000, "speed": 0, "accstatus": 0}, "PARKED"),
    ({"datastatus": 2, "hearttime": 1000, "speed": 0, "accstatus": -1}, "PARKED"),
    ({"datastatus": 4, "hearttime": 1000, "speed": 0, "accstatus": 0}, "OFFLINE"),
    ({"datastatus": 3, "hearttime": 1000, "speed": 50, "accstatus": 1}, "OFFLINE"),
    ({"datastatus": 2, "hearttime": 1000 - 3600, "speed": 50, "accstatus": 1}, "OFFLINE"),
])
def test_tracker_state(record, expected):
    assert tracking_service.derive_state(record, now=1000)[0] == expected


def test_newer_manual_entry_keeps_its_position():
    now = time.time()
    manual = {"source": "MANUAL", "latitude": 1.0, "longitude": 2.0,
              "timestamp": datetime.fromtimestamp(now, tz=timezone.utc).isoformat()}
    record = {"imei": "1", "latitude": 5.0, "longitude": 6.0, "gpstime": int(now) - 600,
              "hearttime": int(now), "datastatus": 2, "speed": 0, "accstatus": 0}
    merged = tracking_service.merge_location(manual, record, "GH", now)
    assert (merged["latitude"], merged["source"]) == (1.0, "MANUAL")
    assert merged["tracker_state"] == "PARKED"


def test_zero_position_is_ignored():
    record = {"imei": "1", "latitude": 0, "longitude": 0, "gpstime": 1, "hearttime": 1, "datastatus": 2}
    merged = tracking_service.merge_location({"latitude": 5.0, "longitude": 6.0}, record, "GH", 1)
    assert merged["latitude"] == 5.0


# ---------------------------------------------------------------- device sync and polling

def test_device_sync_links_by_plate_and_respects_manual_choices(protrack, fake_db):
    result = run(tracking_service.sync_devices(fake_db))
    assert result == {"trackers": 3, "auto_linked": 2}
    links = {t["imei"]: t.get("vehicle_id") for t in fake_db.trackers.docs}
    assert links[imei_for("GH-1")] == "v_gh"
    assert links[imei_for("LR 1")] == "v_lr"  # spaces and dashes are ignored
    assert links[imei_for("UNKNOWN-9")] is None

    tracker = next(t for t in fake_db.trackers.docs if t["imei"] == imei_for("GH-1"))
    tracker.update(vehicle_id=None, link_source="manual")
    run(tracking_service.sync_devices(fake_db))
    assert tracker["vehicle_id"] is None  # a manager's unlink is not undone


@pytest.mark.parametrize("plate,name,expected", [
    ("GS 4548-25", "anything", ("v1", "auto")),
    ("", "Hilux_GS 4548-25", ("v1", "auto_name")),
    ("", "Bike_GE 2767_24", ("v2", "auto_name")),          # underscore instead of a dash
    ("", "BikeM_26-GR5713", ("v3", "auto_name")),          # motorbike plate
    ("", "Prado_GR 926_22", ("v4", "auto_name")),
    ("", "Liberia_1", (None, None)),
    ("", "YEA Bike", (None, None)),
    ("", "Hilux_GS 4548-25 and GE 2767-24", (None, None)),  # two vehicles: leave it to a person
    ("XX 0000-00", "Hilux_GS 4548-25", (None, None)),    # a wrong plate in ProTrack is not overridden by the name
])
def test_trackers_match_vehicles_by_plate_or_device_name(plate, name, expected):
    vehicles = {"v1": "GS 4548-25", "v2": "GE 2767-24", "v3": "M-26-GR 5713", "v4": "GR 926-22"}
    plates = {tracking_service.normalize_plate(reg): [vid] for vid, reg in vehicles.items()}
    assert tracking_service.match_vehicle(plate, name, plates) == expected


def test_poll_feeds_the_country_scoped_map(protrack, fake_db, client):
    run(tracking_service.run_cycle(fake_db))
    gh = client.get("/api/vehicle-locations", headers=auth("fo_gh")).json()
    lr = client.get("/api/vehicle-locations", headers=auth("fo_lr")).json()
    assert [row["vehicle_id"] for row in gh] == ["v_gh"]
    assert [row["vehicle_id"] for row in lr] == ["v_lr"]
    assert gh[0]["source"] == "GPS"
    assert gh[0]["tracker_state"] in {"MOVING", "IDLE", "PARKED", "OFFLINE"}
    assert gh[0]["tracker_odometer_km"] > 0
    assert "imei" in gh[0]
    everything = client.get("/api/vehicle-locations", headers=auth("gfm")).json()
    assert {row["vehicle_id"] for row in everything} == {"v_gh", "v_lr"}


def test_map_shows_who_drove_the_vehicle_today(protrack, fake_db, client):
    run(tracking_service.run_cycle(fake_db))
    # The shared fixture already has logbook trips that started just now.
    lr = client.get("/api/vehicle-locations", headers=auth("fo_lr")).json()[0]
    assert (lr["driver_name"], lr["driver_source"]) == ("C C", "Logbook trip")

    later = (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat()
    fake_db.pretrip_checklists.docs.append({"id": "check_now", "driver_id": "d2_gh", "vehicle_id": "v_gh", "created_at": later})
    gh = client.get("/api/vehicle-locations", headers=auth("fo_gh")).json()[0]
    assert (gh["driver_name"], gh["driver_source"]) == ("B B", "Pre-trip check")  # the most recent wins

    for trip in fake_db.driver_logbook.docs:
        trip["start_time"] = "2020-01-01T00:00:00+00:00"
    fake_db.pretrip_checklists.docs.clear()
    assert "driver_name" not in client.get("/api/vehicle-locations", headers=auth("fo_gh")).json()[0]


def test_drivers_cannot_see_tracking(protrack, fake_db, client):
    for path in ("/api/tracking/status", "/api/trackers", "/api/vehicle-locations/v_gh/route?start=2026-01-01T00:00:00Z&end=2026-01-01T01:00:00Z"):
        assert client.get(path, headers=auth("driver_gh")).status_code == 403, path


# ---------------------------------------------------------------- route replay

def _route(client, user, vehicle, start, end):
    return client.get(
        f"/api/vehicle-locations/{vehicle}/route",
        params={"start": start.isoformat(), "end": end.isoformat()},
        headers=auth(user),
    )


def test_route_follows_protrack_pages(protrack, fake_db, client):
    run(tracking_service.sync_devices(fake_db))
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=6)
    response = _route(client, "fo_gh", "v_gh", start, end)
    assert response.status_code == 200, response.text
    body = response.json()
    times = [p[2] for p in body["points"]]
    assert len(times) > 2000  # three ProTrack pages at one point every 10 seconds
    assert times == sorted(set(times))  # no duplicates where pages meet
    summary = body["summary"]
    assert summary["distance_km"] > 0
    assert summary["max_speed_kmh"] > 0
    assert summary["stops"], "the mock parks for 10 minutes every hour"
    assert not body["truncated"]


def test_route_access_and_limits(protrack, fake_db, client):
    run(tracking_service.sync_devices(fake_db))
    end = datetime.now(timezone.utc)
    assert _route(client, "fo_lr", "v_gh", end - timedelta(hours=1), end).status_code == 403
    assert _route(client, "fo_gh", "v_gh", end - timedelta(days=8), end).status_code == 400
    assert _route(client, "fo_gh", "v_gh", end, end - timedelta(hours=1)).status_code == 400
    tracker = next(t for t in fake_db.trackers.docs if t.get("vehicle_id") == "v_gh")
    tracker["vehicle_id"] = None
    assert _route(client, "fo_gh", "v_gh", end - timedelta(hours=1), end).status_code == 404


# ---------------------------------------------------------------- tracker management

def test_tracker_management_is_for_managers_in_their_country(protrack, fake_db, client):
    run(tracking_service.sync_devices(fake_db))
    assert client.get("/api/trackers", headers=auth("fo_gh")).status_code == 403

    rows = client.get("/api/trackers", headers=auth("fm_gh")).json()
    plates = {r["protrack_plate"] for r in rows}
    assert plates == {"GH-1", "UNKNOWN-9"}  # Liberia's linked tracker is hidden
    assert len(client.get("/api/trackers", headers=auth("gfm")).json()) == 3

    unknown = imei_for("UNKNOWN-9")
    assert client.put(f"/api/trackers/{unknown}", json={"vehicle_id": "v_lr"}, headers=auth("fm_gh")).status_code == 403
    assert client.put(f"/api/trackers/{unknown}", json={"vehicle_id": "v_gh"}, headers=auth("fm_gh")).status_code == 409
    lr_tracker = imei_for("LR 1")
    assert client.put(f"/api/trackers/{lr_tracker}", json={"vehicle_id": None}, headers=auth("fm_gh")).status_code == 403

    gh_tracker = imei_for("GH-1")
    response = client.put(f"/api/trackers/{gh_tracker}", json={"vehicle_id": "v_gh"}, headers=auth("fm_gh"))
    assert response.status_code == 200
    assert response.json()["confirmed"] is True
    assert any(e.get("action") == "tracker_link" for e in fake_db.audit_logs.docs)


def test_status_reports_a_healthy_connection(protrack, fake_db, client):
    run(tracking_service.run_cycle(fake_db))
    status = client.get("/api/tracking/status", headers=auth("fo_gh")).json()
    assert status["state"] == "ok"
    assert status["trackers_total"] is None  # GTI-wide count is for group managers
    assert status["trackers_linked"] == 1  # Ghana only
    assert status["trackers_without_position"] == 0
    everything = client.get("/api/tracking/status", headers=auth("gfm")).json()
    assert (everything["trackers_total"], everything["trackers_linked"]) == (3, 2)

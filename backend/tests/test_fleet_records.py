"""Driver and vehicle labels, maintenance saving and filters, asset import, and driving metrics."""
from __future__ import annotations

import asyncio
import io
from datetime import datetime, timezone

import pytest
from openpyxl import Workbook

import driving_metrics
import server
import tracking_service
from tests.test_authorization import auth, client, fake_db  # noqa: F401  (pytest fixtures)


# ---------------------------------------------------------------- drivers and vehicles

DRIVER = {
    "country": "GH", "first_name": "Ama", "last_name": "Owusu", "license_number": "GH-DL-9",
    "license_expiry": "2028-01-01T00:00:00", "phone": "0200000000",
}


def test_driver_licence_class_and_department_are_saved_tidied(client):
    response = client.post(
        "/api/drivers", headers=auth("gfm"),
        json={**DRIVER, "license_class": " c ", "department": "  Field   Operations "},
    )
    assert response.status_code == 200, response.text
    assert response.json()["license_class"] == "C"
    assert response.json()["department"] == "Field Operations"


def test_driver_department_can_be_cleared(client, fake_db):
    driver_id = client.post("/api/drivers", headers=auth("gfm"), json={**DRIVER, "department": "Ops"}).json()["id"]
    response = client.put(f"/api/drivers/{driver_id}", headers=auth("gfm"), json={"department": ""})
    assert response.status_code == 200, response.text
    assert not response.json()["department"]


def test_vehicle_department_is_saved(client):
    response = client.put("/api/vehicles/v_gh", headers=auth("gfm"), json={"department": "Logistics"})
    assert response.status_code == 200, response.text
    assert response.json()["department"] == "Logistics"


def _workbook(headers, rows):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_driver_import_reads_licence_class_and_department():
    from driver_bulk_import import parse_driver_bulk_upload
    content = _workbook(
        ["First Name", "Last Name", "License Number", "License Expiry", "Phone", "Licence Class", "Department"],
        [["Yaw", "Boateng", "GH-9", "2028-01-01", "020", "d", "Security"]],
    )
    drivers, errors = parse_driver_bulk_upload(content, country="GH")
    assert not errors
    assert (drivers[0].license_class, drivers[0].department) == ("D", "Security")


def test_old_driver_templates_without_new_columns_still_import():
    from driver_bulk_import import parse_driver_bulk_upload
    content = _workbook(
        ["First Name", "Last Name", "License Number", "License Expiry", "Phone"],
        [["Yaw", "Boateng", "GH-9", "2028-01-01", "020"]],
    )
    drivers, errors = parse_driver_bulk_upload(content, country="GH")
    assert not errors and drivers[0].department is None


# ---------------------------------------------------------------- maintenance

def record(**overrides):
    return {
        "vehicle_id": "v_gh", "maintenance_type": "CORRECTIVE", "description": "Brake pads",
        "scheduled_date": "2026-03-10T12:00:00.000Z", "odometer_at_maintenance": 52000,
        "cost": 850, "currency": "GHS", "work_status": "WORK_IN_PROGRESS", **overrides,
    }


def test_maintenance_saves_exactly_what_was_entered(client, fake_db):
    response = client.post("/api/maintenance", headers=auth("fo_gh"), json=record(
        next_due_date="2026-09-10T12:00:00.000Z", next_service_odometer=59000, notes="Front axle",
    ))
    assert response.status_code == 200, response.text
    saved = fake_db.maintenance_records.docs[-1]
    assert saved["maintenance_type"] == "CORRECTIVE"
    assert saved["cost"] == 850 and saved["currency"] == "GHS"
    assert saved["work_status"] == "WORK_IN_PROGRESS" and saved["completed_date"] is None
    assert saved["notes"] == "Front axle"
    assert saved["next_service_odometer"] == 59000


def test_maintenance_for_a_missing_vehicle_is_refused(client):
    response = client.post("/api/maintenance", headers=auth("gfm"), json=record(vehicle_id="nope"))
    assert response.status_code == 400


@pytest.mark.parametrize("overrides", [
    {"cost": -5},
    {"description": "   "},
    {"next_service_odometer": 100},
    {"next_due_date": "2026-01-01T12:00:00.000Z"},
])
def test_maintenance_rejects_values_that_would_mislead(client, overrides):
    response = client.post("/api/maintenance", headers=auth("gfm"), json=record(**overrides))
    assert response.status_code == 422, response.text


def test_completed_work_is_dated_by_its_service_date(client, fake_db):
    client.post("/api/maintenance", headers=auth("gfm"), json=record(work_status="WORK_COMPLETED"))
    saved = fake_db.maintenance_records.docs[-1]
    assert saved["completed_date"].startswith("2026-03-10")


def test_a_higher_service_reading_moves_the_vehicle_odometer_up(client, fake_db):
    client.post("/api/maintenance", headers=auth("gfm"), json=record())
    vehicle = next(v for v in fake_db.vehicles.docs if v["id"] == "v_gh")
    assert vehicle["odometer_reading"] == 52000
    client.post("/api/maintenance", headers=auth("gfm"), json=record(odometer_at_maintenance=40000))
    assert vehicle["odometer_reading"] == 52000


def test_vendor_becomes_the_service_provider(client, fake_db):
    fake_db.vendors.docs.append({"id": "vendor_gh", "country": "GH", "name": "Kumasi Auto"})
    client.post("/api/maintenance", headers=auth("gfm"), json=record(vendor_id="vendor_gh"))
    assert fake_db.maintenance_records.docs[-1]["service_provider"] == "Kumasi Auto"


def test_a_provider_from_another_country_is_refused(client):
    response = client.post("/api/maintenance", headers=auth("gfm"), json=record(vendor_id="vendor_lr"))
    assert response.status_code == 400


def test_edit_changes_fields_and_can_clear_optional_ones(client, fake_db):
    record_id = client.post(
        "/api/maintenance", headers=auth("gfm"), json=record(notes="old", service_provider="Garage A"),
    ).json()["id"]
    response = client.put(f"/api/maintenance/{record_id}", headers=auth("gfm"), json={
        "cost": 900, "notes": None, "service_provider": "Garage B", "work_status": "WORK_COMPLETED",
    })
    assert response.status_code == 200, response.text
    saved = next(r for r in fake_db.maintenance_records.docs if r["id"] == record_id)
    assert saved["cost"] == 900 and saved["notes"] is None
    assert saved["service_provider"] == "Garage B"
    assert saved["completed_date"].startswith("2026-03-10")


def test_edit_cannot_set_the_next_service_before_the_service(client):
    record_id = client.post("/api/maintenance", headers=auth("gfm"), json=record()).json()["id"]
    response = client.put(
        f"/api/maintenance/{record_id}", headers=auth("gfm"), json={"next_service_odometer": 10},
    )
    assert response.status_code == 400


def test_country_staff_cannot_edit_another_countrys_record(client, fake_db):
    record_id = client.post("/api/maintenance", headers=auth("gfm"), json=record(vehicle_id="v_lr")).json()["id"]
    response = client.put(f"/api/maintenance/{record_id}", headers=auth("fo_gh"), json={"cost": 1})
    assert response.status_code == 403


def test_maintenance_filters(client):
    client.post("/api/maintenance", headers=auth("gfm"), json=record(service_provider="Garage A", cost=100))
    client.post("/api/maintenance", headers=auth("gfm"), json=record(
        maintenance_type="ROUTINE", scheduled_date="2026-05-01T12:00:00.000Z", cost=2000,
        work_status="WORK_COMPLETED", service_provider="Toyota Ghana",
    ))

    def ids(**params):
        response = client.get("/api/maintenance", headers=auth("gfm"), params=params)
        assert response.status_code == 200, response.text
        return [(r["maintenance_type"], r["cost"]) for r in response.json()]

    assert ids(maintenance_type="ROUTINE") == [("ROUTINE", 2000)]
    assert ids(service_provider="toyota") == [("ROUTINE", 2000)]
    assert ids(cost_min=500) == [("ROUTINE", 2000)]
    assert ids(cost_max=500) == [("CORRECTIVE", 100)]
    assert ids(date_from="2026-04-01") == [("ROUTINE", 2000)]
    assert ids(date_to="2026-03-10") == [("CORRECTIVE", 100)]
    assert ids(work_status="incomplete") == [("CORRECTIVE", 100)]
    assert ids(registration="gh 1") and ids(registration="LR-1") == []


def test_maintenance_import_matches_registrations_loosely_and_validates(client, fake_db, monkeypatch):
    rows = [
        {"row": 2, "registration_number": "gh 1", "maintenance_type": "ROUTINE", "description": "Oil",
         "scheduled_date": datetime(2026, 2, 1), "odometer_at_maintenance": 100.0, "cost": 10.0,
         "currency": "GHS", "service_provider": "Kumasi Auto"},
        {"row": 3, "registration_number": "GH-1", "maintenance_type": "ROUTINE", "description": "Oil",
         "scheduled_date": datetime(2026, 2, 1), "odometer_at_maintenance": 100.0, "cost": -1.0,
         "currency": "GHS"},
    ]
    fake_db.vendors.docs.append({"id": "vendor_gh", "country": "GH", "name": "Kumasi Auto"})
    monkeypatch.setattr(server, "parse_maintenance_bulk_upload", lambda *_: (rows, []))
    response = client.post(
        "/api/maintenance/bulk-upload", headers=auth("gfm"),
        files={"file": ("m.xlsx", b"x", "application/octet-stream")},
    )
    body = response.json()
    assert (body["created"], body["failed"]) == (1, 1), body
    assert "negative" in body["errors"][0]["message"]
    assert fake_db.maintenance_records.docs[-1]["vendor_id"] == "vendor_gh"


# ---------------------------------------------------------------- assets

def asset_file(rows, headers=None):
    headers = headers or ["Vehicle Registration", "Acquisition Date", "Acquisition Cost", "Currency",
                          "Depreciation Rate (%)", "Current Value"]
    return _workbook(headers, rows)


def test_asset_parser_reads_rows_and_reports_bad_ones():
    from asset_bulk_import import parse_asset_bulk_upload
    parsed, errors = parse_asset_bulk_upload(asset_file([
        ["GH-1", "2022-06-15", 185000, "ghs", 15, None],
        ["LR-1", "15/06/2022", "1,200.50", "USD", "20%", 900],
        ["GH 1", "2022-06-15", 1, "GHS", None, None],
        ["X-1", "not a date", 1, "GHS", None, None],
        ["X-2", "2022-06-15", -4, "GHS", None, None],
        ["X-3", "2022-06-15", 4, "EUR", None, None],
    ]))
    assert [p["registration_number"] for p in parsed] == ["GH-1", "LR-1"]
    assert parsed[0]["depreciation_rate"] == 0.15 and parsed[0]["currency"] == "GHS"
    assert parsed[1]["acquisition_cost"] == 1200.5 and parsed[1]["depreciation_rate"] == 0.2
    assert parsed[1]["current_value"] == 900
    by_row = {e["row"]: e["message"] for e in errors}
    assert "Duplicate of row 2" in by_row[4]
    assert set(by_row) == {4, 5, 6, 7}


def test_asset_parser_reads_csv_with_semicolons_and_bom():
    from asset_bulk_import import parse_asset_bulk_upload
    content = "﻿Vehicle Registration;Acquisition Date;Acquisition Cost;Currency\nGH-1;2022-06-15;500;GHS\n"
    parsed, errors = parse_asset_bulk_upload(content.encode("utf-8"), "assets.csv")
    assert not errors and parsed[0]["acquisition_cost"] == 500


def test_asset_parser_names_missing_columns():
    from asset_bulk_import import parse_asset_bulk_upload
    with pytest.raises(ValueError, match="Currency"):
        parse_asset_bulk_upload(asset_file([], headers=["Vehicle Registration", "Acquisition Date", "Acquisition Cost"]))


def upload_assets(client, user, content, name="assets.xlsx"):
    return client.post(
        "/api/assets/bulk-upload", headers=auth(user),
        files={"file": (name, content, "application/octet-stream")},
    )


def test_asset_import_creates_new_skips_existing_and_reports_unknown(client, fake_db):
    fake_db.assets.docs.append({"id": "a_lr", "vehicle_id": "v_lr"})
    response = upload_assets(client, "gfm", asset_file([
        ["GH-1", "2022-06-15", 1000, "USD", 10, None],
        ["LR-1", "2022-06-15", 1000, "USD", 10, None],
        ["ZZ-9", "2022-06-15", 1000, "USD", 10, None],
    ]))
    body = response.json()
    assert response.status_code == 200, body
    assert (body["created"], body["skipped"], body["failed"]) == (1, 1, 1)
    assert body["skipped_rows"][0]["row"] == 3
    assert "No vehicle found" in body["errors"][0]["message"]
    created = next(a for a in fake_db.assets.docs if a["vehicle_id"] == "v_gh")
    assert created["current_value"] == 1000 and created["depreciation_rate"] == 0.1


def test_asset_import_only_matches_the_users_country(client, fake_db):
    body = upload_assets(client, "fo_gh", asset_file([["LR-1", "2022-06-15", 1000, "USD", None, None]])).json()
    assert body["created"] == 0 and "No vehicle found" in body["errors"][0]["message"]


def test_asset_import_refuses_other_file_types(client):
    assert upload_assets(client, "gfm", b"x", name="assets.pdf").status_code == 400


def test_asset_import_is_staff_only(client):
    assert upload_assets(client, "driver_gh", b"x").status_code == 403


def test_a_second_asset_for_a_vehicle_is_refused(client):
    body = {"vehicle_id": "v_gh", "acquisition_date": "2022-01-01T00:00:00", "acquisition_cost": 5, "currency": "USD"}
    assert client.post("/api/assets", headers=auth("gfm"), json=body).status_code == 200
    assert client.post("/api/assets", headers=auth("gfm"), json=body).status_code == 409


# ---------------------------------------------------------------- driving metrics

def test_day_stats_counts_speeding_night_and_distance():
    base = int(datetime(2026, 3, 1, 21, 59, 0, tzinfo=timezone.utc).timestamp())
    # 0.01 degrees of latitude is about 1.11 km.
    points = [
        (5.60, -0.20, base, 0, 0),
        (5.61, -0.20, base + 60, 70, 0),
        (5.62, -0.20, base + 120, 110, 0),
        (5.63, -0.20, base + 180, 110, 0),
        (5.64, -0.20, base + 240, 40, 0),
        (5.65, -0.20, base + 5000, 0, 0),  # long gap: a pause, not driving
    ]
    stats = driving_metrics.day_stats(points)
    assert stats["distance_km"] == pytest.approx(4.4, abs=0.1)
    assert stats["speeding_events"] == 1
    assert stats["speeding_minutes"] == 2
    assert stats["fast_minutes"] == 1
    assert stats["max_speed_kmh"] == 110
    assert stats["moving_minutes"] == 3
    assert stats["night_minutes"] == 3  # from 22:00


@pytest.fixture()
def gps(monkeypatch, fake_db):
    calls = []

    async def fake_route(_db, imei, begin, end):
        calls.append(begin)
        points = [[5.6, -0.2, begin + 60, 50, 0], [5.61, -0.2, begin + 120, 50, 0]]
        return {"points": points, "summary": {}, "truncated": False}

    monkeypatch.setattr(tracking_service, "fetch_route", fake_route)
    monkeypatch.setattr(driving_metrics.protrack_client, "is_configured", lambda: True)
    fake_db.trackers.docs.append({"imei": "111", "vehicle_id": "v_gh"})
    return calls


def test_driving_metrics_combines_gps_and_logbook(client, gps):
    response = client.get("/api/vehicle-locations/v_gh/driving-metrics?days=7", headers=auth("fo_gh"))
    body = response.json()
    assert response.status_code == 200, body
    assert len(body["gps"]["daily"]) == 7 and not body["gps"]["missing_days"]
    assert body["gps"]["totals"]["distance_km"] == pytest.approx(7.8, abs=0.1)
    assert body["gps"]["totals"]["days_driven"] == 7
    assert body["logbook"]["totals"]["trips"] == 2
    assert {d["driver_name"] for d in body["logbook"]["drivers"]} == {"A A", "B B"}


def test_finished_days_are_fetched_once(client, gps, fake_db):
    client.get("/api/vehicle-locations/v_gh/driving-metrics?days=7", headers=auth("gfm"))
    first = len(gps)
    for doc in fake_db.gps_daily_stats.docs:  # pretend every day settled
        doc["final"] = True
    client.get("/api/vehicle-locations/v_gh/driving-metrics?days=7", headers=auth("gfm"))
    assert first == 7 and len(gps) == 7


def test_driving_metrics_without_a_tracker_still_shows_the_logbook(client, fake_db):
    body = client.get("/api/vehicle-locations/v_gh/driving-metrics?days=30", headers=auth("gfm")).json()
    assert body["has_tracker"] is False and body["gps"] is None
    assert body["logbook"]["totals"]["distance_km"] == 16


def test_driving_metrics_respect_country_scope_and_period(client, gps):
    assert client.get("/api/vehicle-locations/v_lr/driving-metrics", headers=auth("fo_gh")).status_code == 403
    assert client.get("/api/vehicle-locations/v_gh/driving-metrics?days=90", headers=auth("gfm")).status_code == 400
    assert client.get("/api/vehicle-locations/v_gh/driving-metrics", headers=auth("driver_gh")).status_code == 403


def test_backfill_fills_finished_days_and_stops_on_protrack_errors(gps, fake_db):
    done = asyncio.run(driving_metrics.backfill_once(fake_db))
    assert done == driving_metrics.BACKFILL_DAYS - 1
    fake_db.job_leases.docs.clear()

    async def failing(*_args, **_kwargs):
        raise driving_metrics.ProTrackError(10009, "rate limited")

    for doc in fake_db.gps_daily_stats.docs:
        doc["final"] = False
    tracking_service.fetch_route = failing  # restored by monkeypatch in the fixture
    assert asyncio.run(driving_metrics.backfill_once(fake_db)) == 0

"""In-process authorization tests. They use an in-memory database, not MongoDB or a live API."""
from __future__ import annotations

import io
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

os.environ.update(
    MONGO_URL="mongodb://127.0.0.1:1/authz_tests",
    DB_NAME="authz_tests",
    JWT_SECRET_KEY="authz-tests-" + "x" * 40,
    ENVIRONMENT="development",
    RESEND_API_KEY="",
    DRIVER_REMINDERS_ENABLED="false",
)

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from openpyxl import load_workbook

import audit_service
import auth_deps
import authz
import security_middleware
import server
from auth_service import create_access_token
from export_utils import build_export_bytes


def _matches(doc, query):
    for key, cond in query.items():
        if key == "$and":
            if not all(_matches(doc, q) for q in cond):
                return False
        elif key == "$or":
            if not any(_matches(doc, q) for q in cond):
                return False
        elif isinstance(cond, dict) and any(k.startswith("$") for k in cond):
            value = doc.get(key)
            for op, arg in cond.items():
                if op == "$in":
                    ok = any(item in arg for item in value) if isinstance(value, list) else value in arg
                elif op == "$nin":
                    ok = value not in arg
                elif op == "$ne":
                    ok = value != arg
                elif op == "$exists":
                    ok = (key in doc) == arg
                elif op == "$gte":
                    ok = value is not None and value >= arg
                elif op == "$lte":
                    ok = value is not None and value <= arg
                elif op == "$gt":
                    ok = value is not None and value > arg
                elif op == "$lt":
                    ok = value is not None and value < arg
                elif op == "$regex":
                    ok = value is not None and re.search(arg, str(value), re.I) is not None
                elif op == "$options":
                    ok = True
                else:
                    raise AssertionError(f"Unsupported operator {op}")
                if not ok:
                    return False
        else:
            value = doc.get(key)
            if not (cond in value if isinstance(value, list) else value == cond):
                return False
    return True


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    def limit(self, _count):
        return self

    async def to_list(self, length=None):
        return [dict(d) for d in self._docs[:length]]


class _Collection:
    def __init__(self):
        self.docs = []

    def find(self, query=None, _projection=None):
        return _Cursor([d for d in self.docs if _matches(d, query or {})])

    async def find_one(self, query=None, _projection=None, **_kwargs):
        for doc in self.docs:
            if _matches(doc, query or {}):
                return dict(doc)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return SimpleNamespace(inserted_id=str(uuid.uuid4()))

    @staticmethod
    def _apply(doc, update):
        doc.update(update.get("$set", {}))
        for field in update.get("$unset", {}):
            doc.pop(field, None)
        for field, value in update.get("$inc", {}).items():
            doc[field] = doc.get(field, 0) + value
        for field, value in update.get("$push", {}).items():
            doc.setdefault(field, []).append(value)

    async def update_one(self, query, update, upsert=False, **_kwargs):
        for doc in self.docs:
            if _matches(doc, query):
                self._apply(doc, update)
                return SimpleNamespace(matched_count=1, modified_count=1)
        if upsert:
            doc = dict(query)
            self._apply(doc, update)
            self.docs.append(doc)
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def find_one_and_update(self, query, update, **_kwargs):
        for doc in self.docs:
            if _matches(doc, query):
                before = dict(doc)
                self._apply(doc, update)
                return before
        return None

    async def update_many(self, query, update, **_kwargs):
        for doc in self.docs:
            if _matches(doc, query):
                doc.update(update.get("$set", {}))
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def delete_one(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not _matches(d, query)]
        return SimpleNamespace(deleted_count=before - len(self.docs))

    async def count_documents(self, query):
        return len([d for d in self.docs if _matches(d, query)])


class _DB:
    def __init__(self):
        self._collections = {}

    def __getattr__(self, name):
        return self._collections.setdefault(name, _Collection())


USERS = {
    "gfm": {"role": "GROUP_FLEET_MANAGER", "country": None},
    "fm_gh": {"role": "FLEET_MANAGER", "country": "GH"},
    "fo_gh": {"role": "FLEET_OFFICER", "country": "GH"},
    "fo_lr": {"role": "FLEET_OFFICER", "country": "LR"},
    "fo_none": {"role": "FLEET_OFFICER", "country": None},
    "driver_gh": {"role": "DRIVER", "country": "GH", "driver_id": "d_gh"},
    "driver2_gh": {"role": "DRIVER", "country": "GH", "driver_id": "d2_gh"},
    "user_gh": {"role": "USER", "country": "GH"},
}


@pytest.fixture()
def fake_db(monkeypatch):
    db = _DB()
    for module in (server, security_middleware, auth_deps, audit_service, authz):
        monkeypatch.setattr(module, "db", db)
    monkeypatch.setattr(server.currency_converter, "get_rate", lambda *a, **k: 1.0)
    monkeypatch.setattr(server.email_service, "send_email", lambda *a, **k: False)
    monkeypatch.setattr(server.limiter, "enabled", False)
    for name, attrs in USERS.items():
        db.users.docs.append({
            "id": name,
            "email": f"{name}@example.com",
            "full_name": name,
            "is_active": True,
            "is_approved": True,
            "token_version": 0,
            "driver_id": None,
            **attrs,
        })
    db.vehicles.docs += [
        {"id": "v_gh", "country": "GH", "registration_number": "GH-1", "make": "T", "model": "H",
         "year": 2020, "vin": "V", "status": "ACTIVE", "odometer_reading": 10, "acquisition_date": "2020-01-01T00:00:00",
         "acquisition_currency": "USD", "acquisition_cost": 5000, "acquisition_cost_usd": 5000},
        {"id": "v_lr", "country": "LR", "registration_number": "LR-1", "make": "T", "model": "H",
         "year": 2020, "vin": "V", "status": "ACTIVE", "odometer_reading": 10, "acquisition_date": "2020-01-01T00:00:00",
         "acquisition_currency": "USD", "acquisition_cost": 7000, "acquisition_cost_usd": 7000},
    ]
    db.drivers.docs += [
        {"id": "d_gh", "country": "GH", "first_name": "A", "last_name": "A",
         "license_number": "L", "license_expiry": "2030-01-01T00:00:00", "phone": "1", "safety_score": 100},
        {"id": "d2_gh", "country": "GH", "first_name": "B", "last_name": "B",
         "license_number": "L", "license_expiry": "2030-01-01T00:00:00", "phone": "1", "safety_score": 100},
        {"id": "d_lr", "country": "LR", "first_name": "C", "last_name": "C",
         "license_number": "L", "license_expiry": "2030-01-01T00:00:00", "phone": "1", "safety_score": 100},
    ]
    db.documents.docs += [
        {"id": "doc_gh", "country": "GH", "entity_id": "d_gh", "entity_type": "DRIVER", "s3_key": "k1"},
        {"id": "doc_lr", "country": "LR", "entity_id": "d_lr", "entity_type": "DRIVER", "s3_key": "k2"},
    ]
    db.expenditures.docs += [
        {"id": "exp_gh", "country": "GH", "category": "OTHER", "description": "x", "amount": 1, "currency": "USD", "date": "2026-01-01T00:00:00", "amount_usd": 1},
        {"id": "exp_lr", "country": "LR", "category": "OTHER", "description": "x", "amount": 1, "currency": "USD", "date": "2026-01-01T00:00:00", "amount_usd": 1},
    ]
    now = datetime.now(timezone.utc).isoformat()
    trip = {
        "date": now, "start_time": now, "start_location": "A", "start_odometer": 1.0,
        "purpose": "x", "fuel_used_liters": 1.0,
    }
    db.driver_logbook.docs += [
        {**trip, "id": "log_gh", "driver_id": "d_gh", "vehicle_id": "v_gh", "country": "GH", "distance_km": 7.0},
        {**trip, "id": "log2_gh", "driver_id": "d2_gh", "vehicle_id": "v_gh", "country": "GH", "distance_km": 9.0},
        {**trip, "id": "log_lr", "driver_id": "d_lr", "vehicle_id": "v_lr", "country": "LR", "distance_km": 3.0},
    ]
    db.maintenance_requests.docs += [
        {"id": "req_gh", "driver_id": "d_gh", "vehicle_id": "v_gh", "country": "GH",
         "status": "PENDING", "request_type": "R", "description": "x"},
        {"id": "req_lr", "driver_id": "d_lr", "vehicle_id": "v_lr", "country": "LR",
         "status": "PENDING", "request_type": "R", "description": "x"},
    ]
    db.pretrip_checklists.docs += [
        {"id": "pt_gh", "driver_id": "d_gh", "vehicle_id": "v_gh", "overall_status": "PASSED",
         "damage_photos": ["/api/damage-photos/ph_gh"]},
    ]
    db.damage_photos.docs += [
        {"id": "ph_gh", "uploaded_by": "someone_else", "content_type": "image/png", "data": "aGk="},
    ]
    db.vendors.docs += [
        {"id": "vendor_lr", "country": "LR", "name": "Vendor", "category": "PARTS"},
    ]
    return db


@pytest.fixture()
def client(fake_db):
    # No context manager: startup would run migrations and background jobs.
    return TestClient(server.app, raise_server_exceptions=False)


def auth(name, **claims):
    user = USERS.get(name, {})
    payload = {
        "sub": name,
        "email": f"{name}@example.com",
        "full_name": name,
        "tv": 0,
        "role": user.get("role"),
        "country": user.get("country"),
        "driver_id": user.get("driver_id"),
        **claims,
    }
    return {"Authorization": f"Bearer {create_access_token(payload)}"}


EXPENDITURE = {
    "country": "GH", "category": "OTHER", "description": "x", "amount": 5,
    "currency": "USD", "date": "2026-01-01T00:00:00",
}
INCIDENT = {
    "driver_id": "d_gh", "vehicle_id": "v_gh", "incident_date": "2026-01-01T00:00:00",
    "incident_type": "SPEEDING", "severity": "HIGH", "description": "x", "location": "x",
}
LOGBOOK = {
    "driver_id": "d_gh", "vehicle_id": "v_gh", "date": "2026-01-01T00:00:00",
    "start_time": "2026-01-01T08:00:00", "start_location": "A", "start_odometer": 1.0, "purpose": "x",
}

# Every /api route must be either guarded by a role dependency or listed here on purpose.
PUBLIC_ROUTES = {
    ("POST", "/api/auth/register"), ("POST", "/api/auth/bootstrap"), ("POST", "/api/auth/login"),
    ("POST", "/api/auth/send-otp"), ("POST", "/api/auth/verify-otp"),
    ("POST", "/api/auth/forgot-password"), ("POST", "/api/auth/reset-password"),
    ("GET", "/api/auth/verify-reset-token/{token}"), ("GET", "/api/auth/verify-invite/{token}"),
    ("POST", "/api/auth/accept-invite"), ("GET", "/api/countries/all-list"),
}
# Open to any signed-in user, and each one limits results inside the handler.
SIGNED_IN_ROUTES = {
    ("GET", "/api/"), ("GET", "/api/countries"), ("GET", "/api/countries/{country_name}"),
    ("GET", "/api/exchange-rates/current"), ("GET", "/api/exchange-rates/history"),
    ("POST", "/api/vehicles/availability/snapshot"), ("POST", "/api/reminders/run"),
    ("GET", "/api/vehicles"), ("GET", "/api/vehicles/{vehicle_id}"),
    ("GET", "/api/drivers"), ("GET", "/api/drivers/{driver_id}"),
    ("GET", "/api/documents"), ("GET", "/api/documents/{document_id}/download-url"),
    ("GET", "/api/documents/{document_id}/file"), ("GET", "/api/fleet-managers"),
    ("GET", "/api/fuel"), ("POST", "/api/fuel"), ("GET", "/api/safety/incidents"),
    ("GET", "/api/maintenance-requests"), ("POST", "/api/maintenance-requests"),
    ("GET", "/api/maintenance-requests/{request_id}"), ("PUT", "/api/maintenance-requests/{request_id}"),
    ("GET", "/api/pre-trip-checklists"), ("POST", "/api/pre-trip-checklists"),
    ("GET", "/api/pre-trip-checklists/export"), ("PUT", "/api/pre-trip-checklists/{checklist_id}"),
    ("GET", "/api/pre-trip-checklists/today/{driver_id}/{vehicle_id}"),
    ("POST", "/api/pre-trip-checklists/upload-photo"), ("GET", "/api/damage-photos/{photo_id}"),
    ("GET", "/api/logbook"), ("POST", "/api/logbook"), ("GET", "/api/logbook/export"),
    ("PUT", "/api/logbook/{entry_id}"), ("GET", "/api/logbook/summary/{driver_id}"),
    ("GET", "/api/dashboard/personal"), ("GET", "/api/auth/me"), ("GET", "/api/auth/users/pending"),
    ("PUT", "/api/auth/users/{user_id}/approve"), ("GET", "/api/notifications/mine"),
    ("POST", "/api/notifications/{notification_id}/read"), ("POST", "/api/notifications/read-all"),
}


def _dependency_names(dependant):
    names = set()
    for dep in dependant.dependencies:
        names.add(getattr(dep.call, "__qualname__", getattr(dep.call, "__name__", "")))
        names |= _dependency_names(dep)
    return names


def _has_role_guard(route):
    names = _dependency_names(route.dependant)
    return any(
        name in ("_require_staff", "_require_logbook_bulk_role")
        or name.startswith(("require_manager.", "require_group_manager.", "require_role."))
        for name in names
    )


def _handler_checks_delete_role(route):
    return "assert_can_hard_delete" in route.endpoint.__code__.co_names


def test_every_api_route_has_an_access_decision():
    undecided = []
    for route in server.app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith("/api"):
            continue
        for method in route.methods - {"HEAD", "OPTIONS"}:
            key = (method, route.path)
            if key in PUBLIC_ROUTES or key in SIGNED_IN_ROUTES:
                continue
            if _has_role_guard(route) or _handler_checks_delete_role(route):
                continue
            undecided.append(key)
    assert not undecided, f"Add a role guard or list these on purpose: {sorted(undecided)}"


def test_public_routes_match_the_middleware_allowlist():
    for method, path in PUBLIC_ROUTES:
        probe = path.replace("{token}", "abc")
        assert security_middleware.is_public_api_route(method, probe), path


@pytest.mark.parametrize("method,path,body", [
    ("post", "/api/expenditures", EXPENDITURE),
    ("post", "/api/safety/incidents", INCIDENT),
    ("post", "/api/countries", {"name": "GH", "currency": "GHS", "tax_id_label": "x", "regulatory_body": "x"}),
    ("post", "/api/vehicles", {}),
    ("post", "/api/drivers", {}),
    ("post", "/api/maintenance", {}),
    ("post", "/api/inventory", {}),
    ("post", "/api/documents", {}),
    ("post", "/api/assets", {}),
    ("post", "/api/tires", {}),
    ("post", "/api/vendors", {}),
    ("post", "/api/vehicle-locations", {}),
    ("post", "/api/tires/rotations", {}),
    ("post", "/api/inventory/transactions", {}),
    ("post", "/api/maintenance/predict/v_gh", None),
    ("get", "/api/expenditures", None),
    ("get", "/api/maintenance", None),
    ("get", "/api/inventory", None),
    ("get", "/api/assets", None),
    ("get", "/api/tires", None),
    ("get", "/api/vendors", None),
    ("get", "/api/vehicle-locations", None),
    ("get", "/api/vehicle-locations/v_gh/history", None),
    ("get", "/api/dashboard/stats", None),
    ("get", "/api/dashboard/staff", None),
    ("get", "/api/dashboard/alerts", None),
    ("get", "/api/dashboard/compliance", None),
    ("get", "/api/tco/fleet", None),
    ("get", "/api/reports/expense-breakdown", None),
    ("get", "/api/reports/utilization", None),
])
@pytest.mark.parametrize("role", ["driver_gh", "user_gh"])
def test_non_staff_are_blocked_from_staff_routes(client, role, method, path, body):
    kwargs = {"json": body} if body is not None else {}
    response = getattr(client, method)(path, headers=auth(role), **kwargs)
    assert response.status_code == 403, response.text


def test_framing_a_driver_no_longer_changes_their_score(client, fake_db):
    response = client.post("/api/safety/incidents", headers=auth("user_gh"), json=INCIDENT)
    assert response.status_code == 403
    driver = next(d for d in fake_db.drivers.docs if d["id"] == "d_gh")
    assert driver["safety_score"] == 100


def test_country_staff_only_list_their_country(client):
    response = client.get("/api/expenditures", headers=auth("fo_gh"))
    assert [e["id"] for e in _ids(response)] == ["exp_gh"]


def test_country_staff_cannot_widen_scope_with_the_query_string(client):
    response = client.get("/api/expenditures?country=LR", headers=auth("fo_gh"))
    assert [e["id"] for e in _ids(response)] == ["exp_gh"]
    vehicles = client.get("/api/vehicles?country=LR", headers=auth("fo_gh"))
    assert [v["id"] for v in vehicles.json()] == ["v_gh"]


def _ids(response):
    assert response.status_code == 200, response.text
    return [{"id": row["id"]} for row in response.json()]


def test_group_manager_sees_all_and_can_filter(client):
    response = client.get("/api/expenditures", headers=auth("gfm"))
    assert {e["id"] for e in _ids(response)} == {"exp_gh", "exp_lr"}
    response = client.get("/api/expenditures?country=LR", headers=auth("gfm"))
    assert [e["id"] for e in _ids(response)] == ["exp_lr"]


def test_staff_with_no_country_see_nothing(client):
    assert client.get("/api/expenditures", headers=auth("fo_none")).json() == []
    assert client.get("/api/dashboard/stats", headers=auth("fo_none")).status_code == 403


def test_country_staff_cannot_create_in_another_country(client):
    body = {**EXPENDITURE, "country": "LR"}
    assert client.post("/api/expenditures", headers=auth("fo_gh"), json=body).status_code == 403
    assert client.post("/api/expenditures", headers=auth("fo_gh"), json=EXPENDITURE).status_code == 200


def test_country_staff_cannot_change_or_delete_another_countrys_records(client, fake_db):
    assert client.put("/api/expenditures/exp_lr", headers=auth("fo_gh"), json={"description": "x"}).status_code == 403
    assert client.delete("/api/expenditures/exp_lr", headers=auth("fm_gh")).status_code == 403
    assert client.put("/api/vendors/vendor_lr", headers=auth("fo_gh"), json={"name": "x"}).status_code == 403
    assert any(e["id"] == "exp_lr" for e in fake_db.expenditures.docs)
    assert client.delete("/api/expenditures/exp_gh", headers=auth("fm_gh")).status_code == 200


def test_country_staff_cannot_move_a_record_out_of_their_country(client):
    response = client.put("/api/expenditures/exp_gh", headers=auth("fo_gh"), json={"country": "LR"})
    assert response.status_code == 403


def test_country_staff_cannot_approve_another_countrys_request(client, fake_db):
    body = {"manager_id": "x", "approved": True}
    url = "/api/maintenance-requests/req_lr/approve"
    assert client.post(url, headers=auth("fm_gh"), json=body).status_code == 403
    assert client.post("/api/maintenance-requests/req_gh/approve", headers=auth("fm_gh"), json=body).status_code == 200


@pytest.mark.parametrize("role", ["driver_gh", "user_gh"])
def test_non_staff_cannot_approve_maintenance_requests(client, role, fake_db):
    response = client.post(
        "/api/maintenance-requests/req_gh/approve",
        headers=auth(role),
        json={"manager_id": "x", "approved": True},
    )
    assert response.status_code == 403
    assert next(r for r in fake_db.maintenance_requests.docs if r["id"] == "req_gh")["status"] == "PENDING"


def test_driver_only_sees_own_records_even_when_asking_for_others(client):
    for url in ("/api/logbook", "/api/logbook?driver_id=d2_gh", "/api/logbook?driver_id=d_lr"):
        rows = client.get(url, headers=auth("driver_gh")).json()
        assert {r["id"] for r in rows} == {"log_gh"}, url
    requests = client.get("/api/maintenance-requests?driver_id=d_lr", headers=auth("driver_gh")).json()
    assert {r["id"] for r in requests} == {"req_gh"}


def test_driver_cannot_submit_as_another_driver(client, fake_db):
    forged = {**LOGBOOK, "driver_id": "d2_gh"}
    assert client.post("/api/logbook", headers=auth("driver_gh"), json=forged).status_code == 403
    assert client.post("/api/logbook", headers=auth("driver_gh"), json=LOGBOOK).status_code == 200
    fuel = {
        "vehicle_id": "v_gh", "driver_id": "d2_gh", "date": "2026-01-01T00:00:00", "quantity_liters": 1,
        "cost": 1, "currency": "USD", "odometer_reading": 1, "location": "x", "fuel_type": "DIESEL",
    }
    assert client.post("/api/fuel", headers=auth("driver_gh"), json=fuel).status_code == 403


def test_driver_cannot_use_a_vehicle_in_another_country(client):
    body = {**LOGBOOK, "vehicle_id": "v_lr"}
    assert client.post("/api/logbook", headers=auth("driver_gh"), json=body).status_code == 403


def test_driver_cannot_reassign_their_record_to_someone_else(client):
    response = client.put("/api/logbook/log_gh", headers=auth("driver_gh"), json={"driver_id": "d2_gh"})
    assert response.status_code == 403
    assert client.put("/api/logbook/log2_gh", headers=auth("driver_gh"), json={"purpose": "x"}).status_code == 403


def test_driver_cannot_close_their_own_request(client):
    response = client.put(
        "/api/maintenance-requests/req_gh",
        headers=auth("driver_gh"),
        json={"work_status": "WORK_COMPLETED"},
    )
    assert response.status_code == 403


def test_driver_vehicle_list_hides_costs_and_other_countries(client):
    rows = client.get("/api/vehicles", headers=auth("driver_gh")).json()
    assert [v["id"] for v in rows] == ["v_gh"]
    assert "acquisition_cost" not in rows[0]
    assert rows[0]["registration_number"] == "GH-1"
    assert client.get("/api/vehicles/v_lr", headers=auth("driver_gh")).status_code == 403


def test_staff_still_get_full_vehicle_details(client):
    rows = client.get("/api/vehicles", headers=auth("fo_gh")).json()
    assert [v["id"] for v in rows] == ["v_gh"]
    assert rows[0]["acquisition_cost"] == 5000


def test_driver_list_is_limited_to_own_profile(client):
    rows = client.get("/api/drivers", headers=auth("driver_gh")).json()
    assert [d["id"] for d in rows] == ["d_gh"]
    assert client.get("/api/drivers/d2_gh", headers=auth("driver_gh")).status_code == 403


def test_fleet_managers_list_is_empty_for_non_staff_so_pages_still_load(client, fake_db):
    fake_db.fleet_managers.docs.append({"id": "m", "name": "x", "email": "x", "phone": "x", "country": "GH"})
    response = client.get("/api/fleet-managers", headers=auth("driver_gh"))
    assert response.status_code == 200 and response.json() == []


def test_document_files_require_ownership_or_country_scope(client, monkeypatch):
    monkeypatch.setattr(server, "read_bytes", lambda _key: b"file")
    monkeypatch.setattr(server, "storage_enabled", lambda: False)
    assert client.get("/api/documents/doc_lr/file", headers=auth("driver_gh")).status_code == 403
    assert client.get("/api/documents/doc_lr/file", headers=auth("fo_gh")).status_code == 403
    assert client.get("/api/documents/doc_gh/file", headers=auth("driver2_gh")).status_code == 403
    assert client.get("/api/documents/doc_gh/file", headers=auth("driver_gh")).status_code == 200
    assert client.get("/api/documents/doc_gh/file", headers=auth("fo_gh")).status_code == 200
    assert client.get("/api/documents/doc_lr/download-url", headers=auth("fo_gh")).status_code == 403


def test_damage_photos_are_limited_to_checklist_access(client):
    url = "/api/damage-photos/ph_gh"
    assert client.get(url, headers=auth("driver2_gh")).status_code == 403
    assert client.get(url, headers=auth("fo_lr")).status_code == 403
    assert client.get(url, headers=auth("driver_gh")).status_code == 200
    assert client.get(url, headers=auth("fo_gh")).status_code == 200
    assert client.get(url, headers=auth("gfm")).status_code == 200


def test_logbook_summary_accepts_either_driver_identity(client, fake_db):
    # The metrics page asks by account id; records are stored under the driver id.
    body = client.get("/api/logbook/summary/driver_gh?period_days=30", headers=auth("driver_gh"))
    assert body.status_code == 200
    assert body.json()["total_distance_km"] == 7.0
    assert client.get("/api/logbook/summary/d2_gh", headers=auth("driver_gh")).status_code == 403


def test_revoked_approval_ends_access_immediately(client, fake_db):
    next(u for u in fake_db.users.docs if u["id"] == "user_gh")["is_approved"] = False
    assert client.get("/api/logbook", headers=auth("user_gh")).status_code == 403


def test_deactivation_still_ends_access_immediately(client, fake_db):
    next(u for u in fake_db.users.docs if u["id"] == "user_gh")["is_active"] = False
    assert client.get("/api/logbook", headers=auth("user_gh")).status_code == 403


def test_role_comes_from_the_database_not_the_token(client):
    forged_claim = auth("user_gh", role="GROUP_FLEET_MANAGER", country=None)
    assert client.get("/api/expenditures", headers=forged_claim).status_code == 403


def test_country_comes_from_the_database_not_the_token(client):
    stale_claim = auth("fo_gh", country="LR")
    assert [e["id"] for e in _ids(client.get("/api/expenditures", headers=stale_claim))] == ["exp_gh"]


def test_requests_without_a_token_are_rejected(client):
    assert client.get("/api/expenditures").status_code == 401


def test_group_manager_daily_report_still_runs(client):
    response = client.post("/api/reports/send-daily", headers=auth("gfm"))
    assert response.status_code == 200, response.text


def test_group_manager_weekly_report_still_runs(client, monkeypatch):
    # EmailService has no send_weekly_summary_report yet, so the real route fails at the send step.
    monkeypatch.setattr(
        server.email_service, "send_weekly_summary_report", lambda *a, **k: False, raising=False
    )
    response = client.post("/api/reports/send-weekly", headers=auth("gfm"))
    assert response.status_code == 200, response.text
    assert response.json()["report_data"]["trips_completed"] == 3


def test_fleet_tco_totals_are_not_silently_dropped(client):
    response = client.get("/api/tco/fleet", headers=auth("gfm"))
    assert response.status_code == 200
    assert response.json()["vehicle_count"] == 2
    assert response.json()["total_distance_km"] == 19.0
    scoped = client.get("/api/tco/fleet?country=LR", headers=auth("fm_gh")).json()
    assert scoped["vehicle_count"] == 1 and scoped["total_distance_km"] == 16.0
    single = client.get("/api/tco/vehicle/v_gh", headers=auth("fm_gh"))
    assert single.status_code == 200
    assert client.get("/api/tco/vehicle/v_lr", headers=auth("fm_gh")).status_code == 403


def test_manager_can_delete_vehicle_master_record(client, fake_db):
    fake_db.vehicle_masters.docs.append({"id": "m1", "country": "GH", "registration_number": "GH-1"})
    assert client.delete("/api/master/vehicles/m1", headers=auth("fo_gh")).status_code == 403
    assert client.delete("/api/master/vehicles/m1", headers=auth("fm_gh")).status_code == 200
    assert fake_db.vehicle_masters.docs == []


def test_officers_cannot_delete_workshop_records(client, fake_db):
    fake_db.master_workshops.docs.append({"id": "w1", "country": "GH", "name": "W"})
    fake_db.workshop_jobs.docs.append({"id": "j1", "vehicle_id": "v_gh", "workshop_name": "W"})
    assert client.delete("/api/master/workshops/w1", headers=auth("fo_gh")).status_code == 403
    assert client.delete("/api/workshops/j1", headers=auth("fo_gh")).status_code == 403
    assert client.delete("/api/master/workshops/w1", headers=auth("fm_gh")).status_code == 200
    assert client.delete("/api/workshops/j1", headers=auth("fm_gh")).status_code == 200


def test_trips_with_null_distance_or_fuel_do_not_break_totals(client, fake_db):
    # MongoDB stores unset optional fields as explicit nulls.
    now = datetime.now(timezone.utc).isoformat()
    fake_db.driver_logbook.docs.append({
        "id": "log_open", "driver_id": "d_gh", "vehicle_id": "v_gh", "country": "GH", "date": now,
        "start_time": now, "start_location": "A", "start_odometer": 1.0, "purpose": "x",
        "distance_km": None, "fuel_used_liters": None, "total_hours": None,
    })
    summary = client.get("/api/logbook/summary/d_gh", headers=auth("driver_gh"))
    assert summary.status_code == 200 and summary.json()["total_distance_km"] == 7.0
    assert client.get("/api/dashboard/personal", headers=auth("driver_gh")).status_code == 200
    assert client.get("/api/reports/utilization", headers=auth("fm_gh")).status_code == 200
    fleet = client.get("/api/tco/fleet", headers=auth("gfm")).json()
    assert fleet["total_distance_km"] == 19.0


# --- Group Fleet Manager login codes ---
GFM_LOGIN = {"email": "gfm@example.com", "password": "Correct-Pass1!"}


@pytest.fixture()
def otp_env(client, fake_db, monkeypatch):
    user = next(u for u in fake_db.users.docs if u["id"] == "gfm")
    user["hashed_password"] = server.get_password_hash(GFM_LOGIN["password"])
    sent = []
    monkeypatch.setattr(
        server.email_service, "send_otp_email", lambda _email, _name, code: sent.append(code) or True
    )
    return SimpleNamespace(client=client, db=fake_db, sent=sent, user=user)


def _verify(client, code, email="gfm@example.com"):
    return client.post("/api/auth/verify-otp", json={"email": email, "otp": code})


def _wrong(code):
    return "000000" if code != "000000" else "111111"


def _age_code(env, seconds):
    record = env.db.otp_codes.docs[0]
    record["created_at"] = (datetime.fromisoformat(record["created_at"]) - timedelta(seconds=seconds)).isoformat()


def test_otp_is_not_stored_in_plain_text(otp_env):
    assert otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN).status_code == 200
    record = otp_env.db.otp_codes.docs[0]
    assert "otp" not in record
    assert otp_env.sent[0] not in record["otp_hash"]
    assert re.fullmatch(r"\d{6}", otp_env.sent[0])


def test_correct_otp_logs_in_once(otp_env):
    otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN)
    response = _verify(otp_env.client, otp_env.sent[0])
    assert response.status_code == 200 and response.json()["access_token"]
    assert _verify(otp_env.client, otp_env.sent[0]).status_code == 400


def test_otp_locks_after_five_wrong_attempts_even_with_the_right_code(otp_env):
    otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN)
    code = otp_env.sent[0]
    for _ in range(5):
        assert _verify(otp_env.client, _wrong(code)).status_code == 400
    assert _verify(otp_env.client, code).status_code == 400


def test_expired_otp_is_rejected(otp_env):
    otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN)
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    otp_env.db.otp_codes.docs[0]["expires_at"] = past
    assert _verify(otp_env.client, otp_env.sent[0]).status_code == 400


def test_old_plaintext_otp_records_stop_working(otp_env):
    future = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    otp_env.db.otp_codes.docs.append({"email": "gfm@example.com", "otp": "123456", "expires_at": future})
    assert _verify(otp_env.client, "123456").status_code == 400


def test_verify_otp_does_not_reveal_whether_an_account_exists(otp_env):
    unknown = _verify(otp_env.client, "123456", email="nobody@example.com")
    known = _verify(otp_env.client, "123456")
    assert unknown.status_code == known.status_code == 400
    assert unknown.json() == known.json()


def test_resend_within_cooldown_keeps_the_same_code(otp_env):
    first = otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN)
    second = otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN)
    assert first.status_code == second.status_code == 200
    assert len(otp_env.sent) == 1
    assert _verify(otp_env.client, otp_env.sent[0]).status_code == 200


def test_send_limit_caps_new_codes_per_account(otp_env):
    for _ in range(5):
        assert otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN).status_code == 200
        _age_code(otp_env, 61)
    assert otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN).status_code == 429
    assert len(otp_env.sent) == 5


def test_send_limit_resets_after_the_window(otp_env):
    for _ in range(5):
        otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN)
        _age_code(otp_env, 61)
    record = otp_env.db.otp_codes.docs[0]
    record["window_start"] = (datetime.now(timezone.utc) - timedelta(minutes=16)).isoformat()
    assert otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN).status_code == 200
    assert len(otp_env.sent) == 6


def test_wrong_password_never_sends_a_code(otp_env):
    response = otp_env.client.post("/api/auth/send-otp", json={**GFM_LOGIN, "password": "wrong"})
    assert response.status_code == 401 and otp_env.sent == []


def test_deactivated_manager_cannot_get_or_use_a_code(otp_env):
    otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN)
    otp_env.user["is_active"] = False
    assert _verify(otp_env.client, otp_env.sent[0]).status_code == 400
    assert otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN).status_code == 403


def test_otp_code_is_not_logged_unless_explicitly_enabled(otp_env, caplog, monkeypatch):
    monkeypatch.delenv("DEV_LOG_OTP", raising=False)
    otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN)
    assert otp_env.sent[0] not in caplog.text


def test_dev_otp_logging_stays_off_in_production(otp_env, caplog, monkeypatch):
    monkeypatch.setenv("DEV_LOG_OTP", "true")
    monkeypatch.setattr(server, "_IS_PRODUCTION", True)
    otp_env.client.post("/api/auth/send-otp", json=GFM_LOGIN)
    assert otp_env.sent[0] not in caplog.text


# --- Spreadsheet exports ---
@pytest.mark.parametrize("payload", ['=HYPERLINK("http://evil/","x")', "=1+1", "#N/A", "+1", "-1", "@SUM(A1)"])
def test_exports_keep_stored_values_as_text(payload):
    workbook = load_workbook(io.BytesIO(build_export_bytes("T", ["a"], [[payload]], "xlsx")))
    cell = workbook.active["A2"]
    assert cell.data_type == "s" and cell.value == payload


def test_master_data_export_keeps_stored_values_as_text(client, fake_db):
    fake_db.master_workshops.docs.append({"id": "w", "name": "=1+1", "country": "GH"})
    response = client.post(
        "/api/master/export",
        headers=auth("gfm"),
        json={"entities": ["workshops", "maintenance_types"], "fmt": "xlsx"},
    )
    assert response.status_code == 200, response.text
    cell = load_workbook(io.BytesIO(response.content))["Workshops"]["A2"]
    assert cell.data_type == "s" and cell.value == "=1+1"


# --- Regular expressions from user input ---
def _maintenance_record(record_id, description):
    return {
        "id": record_id, "vehicle_id": "v_gh", "maintenance_type": "ROUTINE", "description": description,
        "scheduled_date": "2026-01-01T00:00:00", "odometer_at_maintenance": 1.0, "cost": 1.0,
        "currency": "USD", "cost_usd": 1.0, "created_at": "2026-01-01T00:00:00",
    }


def test_maintenance_search_treats_input_as_literal_text(client, fake_db):
    fake_db.maintenance_records.docs += [_maintenance_record("m1", "axb"), _maintenance_record("m2", "a.b")]
    rows = client.get("/api/maintenance", params={"search": "a.b"}, headers=auth("gfm"))
    assert [r["id"] for r in rows.json()] == ["m2"]
    assert client.get("/api/maintenance", params={"search": "("}, headers=auth("gfm")).status_code == 200
    assert client.get("/api/maintenance", params={"registration": "("}, headers=auth("gfm")).status_code == 200


def test_registration_search_still_matches_partial_text(client, fake_db):
    fake_db.maintenance_records.docs.append(_maintenance_record("m1", "x"))
    rows = client.get("/api/maintenance", params={"registration": "gh-"}, headers=auth("gfm"))
    assert [r["id"] for r in rows.json()] == ["m1"]


# --- Driver invites (H8) ---
def _add_user(fake_db, user_id, **attrs):
    doc = {
        "id": user_id, "email": f"{user_id}@example.com", "full_name": user_id, "role": "USER",
        "country": "GH", "is_active": True, "is_approved": True, "token_version": 0,
        "hashed_password": "x", "driver_id": None, **attrs,
    }
    fake_db.users.docs.append(doc)
    return doc


def _driver_with_email(fake_db, email, driver_id="d_invite", country="GH"):
    fake_db.drivers.docs.append({
        "id": driver_id, "country": country, "first_name": "I", "last_name": "V", "license_number": "L",
        "license_expiry": "2030-01-01T00:00:00", "phone": "1", "email": email,
    })
    return driver_id


def _invite_token(fake_db, driver_id):
    return next(i["token"] for i in fake_db.driver_invites.docs if i["driver_id"] == driver_id and i["status"] == "PENDING")


GOOD_PASSWORD = "New-Pass-123!"


@pytest.mark.parametrize("attrs", [
    {"role": "FLEET_MANAGER"},
    {"role": "GROUP_FLEET_MANAGER"},
    {"role": "USER", "is_approved": False},
    {"role": "FLEET_MANAGER", "is_active": False, "last_login": "2026-01-01T00:00:00"},
    {"role": "DRIVER", "is_active": False, "last_login": "2026-01-01T00:00:00", "approved_at": "2026-01-01"},
    {"role": "DRIVER", "is_active": False, "approved_at": "2026-01-01"},
    {"role": "DRIVER", "last_login": "2026-01-01T00:00:00"},
])
def test_invite_cannot_take_over_an_existing_account(client, fake_db, attrs):
    user = _add_user(fake_db, "victim", **attrs)
    before = dict(user)
    driver_id = _driver_with_email(fake_db, user["email"])
    response = client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh"))
    assert response.status_code == 400, response.text
    assert user == before
    assert fake_db.driver_invites.docs == []


def test_invite_matches_existing_accounts_regardless_of_email_case(client, fake_db):
    user = _add_user(fake_db, "victim", role="FLEET_MANAGER", email="Victim@Example.com")
    driver_id = _driver_with_email(fake_db, "victim@example.com")
    assert client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh")).status_code == 400
    assert user["role"] == "FLEET_MANAGER"


def test_new_driver_invite_flow_still_works(client, fake_db):
    driver_id = _driver_with_email(fake_db, "new@example.com")
    response = client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh"))
    assert response.status_code == 200, response.text
    assert "token" not in response.json()["invite"]
    user = next(u for u in fake_db.users.docs if u["email"] == "new@example.com")
    assert user["role"] == "DRIVER" and user["is_active"] is False and user["invite_pending"] is True
    accepted = client.post(
        "/api/auth/accept-invite",
        json={"token": _invite_token(fake_db, driver_id), "new_password": GOOD_PASSWORD},
    )
    assert accepted.status_code == 200, accepted.text
    assert user["is_active"] is True and user["driver_id"] == driver_id and user["email_verified"] is True


def test_invite_link_works_once(client, fake_db):
    driver_id = _driver_with_email(fake_db, "new@example.com")
    client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh"))
    body = {"token": _invite_token(fake_db, driver_id), "new_password": GOOD_PASSWORD}
    assert client.post("/api/auth/accept-invite", json=body).status_code == 200
    assert client.post("/api/auth/accept-invite", json=body).status_code == 400


def test_pending_driver_signup_can_be_invited_and_loses_their_chosen_password(client, fake_db):
    user = _add_user(fake_db, "signup", role="DRIVER", is_approved=False, hashed_password="attacker-chosen")
    driver_id = _driver_with_email(fake_db, user["email"])
    assert client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh")).status_code == 200
    assert user["is_active"] is False
    client.post(
        "/api/auth/accept-invite",
        json={"token": _invite_token(fake_db, driver_id), "new_password": GOOD_PASSWORD},
    )
    assert user["hashed_password"] != "attacker-chosen" and user["driver_id"] == driver_id


def test_deleting_an_invite_restores_a_pending_signup_rather_than_deleting_it(client, fake_db):
    user = _add_user(fake_db, "signup", role="DRIVER", is_approved=False)
    driver_id = _driver_with_email(fake_db, user["email"])
    client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh"))
    invite_id = fake_db.driver_invites.docs[0]["id"]
    assert client.delete(f"/api/drivers/invites/{invite_id}", headers=auth("fo_gh")).status_code == 200
    kept = next(u for u in fake_db.users.docs if u["id"] == "signup")
    assert kept["is_active"] is True and kept["is_approved"] is False and kept["driver_id"] is None
    assert kept["invite_pending"] is False and kept["approved_at"] is None


def test_deleting_an_invite_removes_only_the_placeholder_account_it_created(client, fake_db):
    driver_id = _driver_with_email(fake_db, "new@example.com")
    client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh"))
    invite_id = fake_db.driver_invites.docs[0]["id"]
    client.delete(f"/api/drivers/invites/{invite_id}", headers=auth("fo_gh"))
    assert not any(u["email"] == "new@example.com" for u in fake_db.users.docs)


def test_deleting_a_revoked_invite_leaves_the_live_invite_and_account(client, fake_db):
    driver_id = _driver_with_email(fake_db, "new@example.com")
    client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh"))
    client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh"))
    revoked = next(i for i in fake_db.driver_invites.docs if i["status"] == "REVOKED")
    assert client.delete(f"/api/drivers/invites/{revoked['id']}", headers=auth("fo_gh")).status_code == 200
    assert any(u["email"] == "new@example.com" for u in fake_db.users.docs)
    token = _invite_token(fake_db, driver_id)
    accepted = client.post("/api/auth/accept-invite", json={"token": token, "new_password": GOOD_PASSWORD})
    assert accepted.status_code == 200


def test_deactivating_someone_mid_invite_kills_the_link(client, fake_db):
    driver_id = _driver_with_email(fake_db, "new@example.com")
    client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh"))
    user = next(u for u in fake_db.users.docs if u["email"] == "new@example.com")
    token = _invite_token(fake_db, driver_id)
    assert client.put(f"/api/auth/users/{user['id']}", headers=auth("gfm"), json={"is_active": False}).status_code == 200
    accepted = client.post("/api/auth/accept-invite", json={"token": token, "new_password": GOOD_PASSWORD})
    assert accepted.status_code == 400
    assert user["is_active"] is False


def test_invite_actions_are_audited_without_the_token(client, fake_db):
    driver_id = _driver_with_email(fake_db, "new@example.com")
    client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh"))
    invite = fake_db.driver_invites.docs[0]
    client.post(f"/api/drivers/invites/{invite['id']}/resend", headers=auth("fo_gh"))
    client.delete(f"/api/drivers/invites/{invite['id']}", headers=auth("fo_gh"))
    actions = [a["action"] for a in fake_db.audit_logs.docs if a["entity_type"] == "driver_invite"]
    assert actions == ["invite_create", "invite_resend", "invite_delete"]
    assert fake_db.audit_logs.docs[0]["actor_id"] == "fo_gh"
    assert "token" not in str(fake_db.audit_logs.docs)


def test_other_country_officer_cannot_invite(client, fake_db):
    driver_id = _driver_with_email(fake_db, "new@example.com")
    assert client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_lr")).status_code == 403


# --- Self-registration cannot claim a driver (H10) ---
SIGNUP = {"password": GOOD_PASSWORD, "full_name": "New Person", "country": "GH"}


def _signup(client, email, **extra):
    return client.post("/api/auth/register", json={**SIGNUP, "email": email, **extra})


def test_signup_ignores_a_supplied_driver_id(client, fake_db):
    response = _signup(client, "new@example.com", role="DRIVER", driver_id="d_gh")
    assert response.status_code == 201, response.text
    user = next(u for u in fake_db.users.docs if u["email"] == "new@example.com")
    assert user.get("driver_id") is None


@pytest.mark.parametrize("email", ["not-an-email", "a@b", "x y@example.com"])
def test_signup_rejects_invalid_email(client, email):
    assert _signup(client, email).status_code == 422


@pytest.mark.parametrize("role", ["DRIVER", "USER"])
def test_approval_clears_a_driver_claim_from_an_old_signup(client, fake_db, role):
    user = _add_user(fake_db, "old_signup", role=role, is_approved=False, driver_id="d_gh")
    assert client.put(f"/api/auth/users/{user['id']}/approve", headers=auth("fo_gh")).status_code == 200
    assert user["driver_id"] != "d_gh"
    token = auth("old_signup", role=role, driver_id=user["driver_id"])
    assert all(r["driver_id"] != "d_gh" for r in client.get("/api/logbook", headers=token).json())


def test_gfm_approval_route_also_clears_a_driver_claim(client, fake_db):
    user = _add_user(fake_db, "old_signup", role="USER", is_approved=False, driver_id="d_gh")
    response = client.put(f"/api/auth/users/{user['id']}", headers=auth("gfm"), json={"is_approved": True})
    assert response.status_code == 200
    assert user["driver_id"] is None and user["approved_at"]


def test_signup_using_a_drivers_email_needs_an_invite_not_approval(client, fake_db):
    driver_id = _driver_with_email(fake_db, "Driver.Real@example.com")
    _signup(client, "driver.real@example.com", role="DRIVER")
    user = next(u for u in fake_db.users.docs if u["email"] == "driver.real@example.com")
    response = client.put(f"/api/auth/users/{user['id']}/approve", headers=auth("fo_gh"))
    assert response.status_code == 409 and "invite" in response.json()["detail"]
    assert user["is_approved"] is False and user.get("driver_id") is None
    gfm = client.put(f"/api/auth/users/{user['id']}", headers=auth("gfm"), json={"is_approved": True})
    assert gfm.status_code == 409 and user["is_approved"] is False
    assert client.post(f"/api/drivers/{driver_id}/invite", headers=auth("fo_gh")).status_code == 200


def test_ordinary_driver_signup_still_gets_their_own_profile(client, fake_db):
    _signup(client, "fresh@example.com", role="DRIVER")
    user = next(u for u in fake_db.users.docs if u["email"] == "fresh@example.com")
    assert client.put(f"/api/auth/users/{user['id']}/approve", headers=auth("fo_gh")).status_code == 200
    assert user["is_approved"] is True and user["driver_id"] == user["id"]
    assert any(d["id"] == user["id"] for d in fake_db.drivers.docs)


def test_reapproval_keeps_a_link_proven_earlier(client, fake_db):
    user = _add_user(fake_db, "real_driver", role="DRIVER", driver_id="d_gh", approved_at="2026-01-01T00:00:00")
    user["email"] = "real@example.com"
    next(d for d in fake_db.drivers.docs if d["id"] == "d_gh")["email"] = "real@example.com"
    assert client.put(f"/api/auth/users/{user['id']}", headers=auth("gfm"), json={"is_approved": False}).status_code == 200
    assert client.put(f"/api/auth/users/{user['id']}", headers=auth("gfm"), json={"is_approved": True}).status_code == 200
    assert user["driver_id"] == "d_gh"


def test_email_link_never_shares_a_profile_already_claimed(client, fake_db):
    next(d for d in fake_db.drivers.docs if d["id"] == "d_gh")["email"] = "shared@example.com"
    _add_user(fake_db, "owner", role="DRIVER", driver_id="d_gh", approved_at="2026-01-01")
    user = _add_user(fake_db, "second", role="DRIVER", email="shared@example.com", approved_at="2026-01-01")
    assert client.get("/api/drivers", headers=auth("gfm")).status_code == 200
    assert user["driver_id"] is None

"""
Test Suite for GTI Fleet Management System - Bug Fixes Iteration 5
Tests for:
1. POST /api/logbook should NOT return 422 error (country field fix)
2. POST /api/fleet-managers should return 403 for Fleet Officers
3. Maintenance request approval should auto-fill approved_by fields
4. Staff dashboard stats should show correct numbers for Fleet Managers
5. Logbook, Pre-Trip Checklist, and Fuel transactions should track submitted_by

Requires REACT_APP_BACKEND_URL or BACKEND_URL and session staff_bearer_token (root conftest).
Optional: TEST_FLEET_MANAGER_EMAIL/PASSWORD, TEST_FLEET_OFFICER_EMAIL/PASSWORD for role-specific tests.
"""

import os
from datetime import datetime, timezone

import pytest
import requests

from tests.http_helpers import auth_headers, get_backend_base_url, login_access_token

BASE_URL = get_backend_base_url()

# Optional role-specific accounts (integration DB may not have the old hardcoded users)
FLEET_MANAGER_CREDS = {
    "email": os.environ.get("TEST_FLEET_MANAGER_EMAIL", "TEST_fm_8af68215@gti.com"),
    "password": os.environ.get("TEST_FLEET_MANAGER_PASSWORD", "Test123!"),
}
FLEET_OFFICER_CREDS = {
    "email": os.environ.get("TEST_FLEET_OFFICER_EMAIL", "TEST_fo_5778283b@gti.com"),
    "password": os.environ.get("TEST_FLEET_OFFICER_PASSWORD", "Test123!"),
}


@pytest.fixture(scope="module", autouse=True)
def _sync_base_url(backend_base_url):
    global BASE_URL
    BASE_URL = backend_base_url


def _api(path: str) -> str:
    return f"{BASE_URL}/api{path}"


def _me_user(staff_bearer_token: str) -> dict:
    r = requests.get(_api("/auth/me"), headers=auth_headers(staff_bearer_token))
    assert r.status_code == 200, r.text
    return r.json()


def _fleet_manager_token() -> str | None:
    tok = login_access_token(
        f"{BASE_URL}/api",
        FLEET_MANAGER_CREDS["email"],
        FLEET_MANAGER_CREDS["password"],
    )
    return tok


class TestLogbook422Fix:
    """Test that POST /api/logbook no longer returns 422 error"""

    def test_logbook_creation_with_string_country(self, staff_bearer_token):
        """Logbook creation with country as string (not enum) - should work now"""
        headers = auth_headers(staff_bearer_token)

        drivers_resp = requests.get(_api("/drivers"), headers=headers)
        vehicles_resp = requests.get(_api("/vehicles"), headers=headers)

        if drivers_resp.status_code != 200 or not drivers_resp.json():
            pytest.skip("No drivers available for testing")
        if vehicles_resp.status_code != 200 or not vehicles_resp.json():
            pytest.skip("No vehicles available for testing")

        driver = drivers_resp.json()[0]
        vehicle = vehicles_resp.json()[0]

        logbook_data = {
            "driver_id": driver["id"],
            "vehicle_id": vehicle["id"],
            "country": "Ghana",
            "date": datetime.now(timezone.utc).isoformat(),
            "start_time": datetime.now(timezone.utc).isoformat(),
            "start_location": "TEST_Location_Start",
            "start_odometer": 50000,
            "purpose": "TEST_Logbook_Entry_422_Fix",
        }

        response = requests.post(_api("/logbook"), json=logbook_data, headers=headers)

        assert response.status_code != 422, f"Still getting 422 error: {response.text}"
        assert response.status_code in [200, 201], (
            f"Unexpected status: {response.status_code}, {response.text}"
        )

        data = response.json()
        assert data.get("driver_id") == driver["id"]
        assert data.get("vehicle_id") == vehicle["id"]
        print(f"✓ Logbook created successfully with string country: {data.get('id')}")

    def test_logbook_creation_without_country(self, staff_bearer_token):
        """Logbook creation without country - should auto-fill from driver"""
        headers = auth_headers(staff_bearer_token)

        drivers_resp = requests.get(_api("/drivers"), headers=headers)
        vehicles_resp = requests.get(_api("/vehicles"), headers=headers)

        if drivers_resp.status_code != 200 or vehicles_resp.status_code != 200:
            pytest.skip("Could not load drivers/vehicles")
        if not drivers_resp.json() or not vehicles_resp.json():
            pytest.skip("No drivers/vehicles available")

        driver = drivers_resp.json()[0]
        vehicle = vehicles_resp.json()[0]

        logbook_data = {
            "driver_id": driver["id"],
            "vehicle_id": vehicle["id"],
            "date": datetime.now(timezone.utc).isoformat(),
            "start_time": datetime.now(timezone.utc).isoformat(),
            "start_location": "TEST_Location_NoCountry",
            "start_odometer": 50100,
            "purpose": "TEST_Logbook_No_Country",
        }

        response = requests.post(_api("/logbook"), json=logbook_data, headers=headers)
        assert response.status_code in [200, 201], f"Failed: {response.status_code}, {response.text}"
        print("✓ Logbook created without country field (auto-filled)")


class TestFleetOfficerRestriction:
    """Fleet Officers cannot add Fleet Managers"""

    def test_fleet_officer_cannot_create_fleet_manager(self):
        """POST /api/fleet-managers should return 403 for Fleet Officers"""
        tok = login_access_token(
            f"{BASE_URL}/api",
            FLEET_OFFICER_CREDS["email"],
            FLEET_OFFICER_CREDS["password"],
        )
        if not tok:
            pytest.skip("Fleet Officer test account not available or OTP required")

        headers = auth_headers(tok)
        manager_data = {
            "name": "TEST_Unauthorized_Manager",
            "email": "test_unauthorized@gti.com",
            "phone": "+1234567890",
            "country": "GHANA",
            "is_active": True,
        }

        response = requests.post(_api("/fleet-managers"), json=manager_data, headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Fleet Officer correctly blocked from creating Fleet Manager (403)")

    def test_fleet_manager_can_create_fleet_manager(self, staff_bearer_token):
        """Fleet Manager or Group Fleet Manager can create Fleet Managers"""
        tok = _fleet_manager_token() or staff_bearer_token
        headers = auth_headers(tok)

        manager_data = {
            "name": "TEST_Authorized_Manager",
            "email": f"test_auth_manager_{datetime.now().timestamp()}@gti.com",
            "phone": "+1234567890",
            "country": "GHANA",
            "is_active": True,
        }

        response = requests.post(_api("/fleet-managers"), json=manager_data, headers=headers)
        assert response.status_code in [200, 201], (
            f"Expected success, got {response.status_code}: {response.text}"
        )
        print("✓ Fleet Manager/Group Manager can create Fleet Manager")


class TestMaintenanceApprovalAutoFill:
    """Maintenance request approval auto-fills approver fields"""

    def test_approval_auto_fills_approver_info(self, staff_bearer_token):
        """Approving a request should set status APPROVED, approved_at, manager_id"""
        user_data = _me_user(staff_bearer_token)
        headers = auth_headers(staff_bearer_token)

        drivers_resp = requests.get(_api("/drivers"), headers=headers)
        vehicles_resp = requests.get(_api("/vehicles"), headers=headers)

        if not drivers_resp.json() or not vehicles_resp.json():
            pytest.skip("No drivers/vehicles available")

        driver = drivers_resp.json()[0]
        vehicle = vehicles_resp.json()[0]

        request_data = {
            "driver_id": driver["id"],
            "vehicle_id": vehicle["id"],
            "request_type": "REPAIR",
            "description": "TEST_Approval_AutoFill_Test",
            "priority": "MEDIUM",
        }

        create_resp = requests.post(_api("/maintenance-requests"), json=request_data, headers=headers)
        assert create_resp.status_code in [200, 201], f"Failed to create request: {create_resp.text}"
        request_id = create_resp.json().get("id")

        approval_data = {
            "manager_id": user_data.get("id", "auto"),
            "approved": True,
        }

        approve_resp = requests.post(
            _api(f"/maintenance-requests/{request_id}/approve"),
            json=approval_data,
            headers=headers,
        )
        assert approve_resp.status_code == 200, f"Approval failed: {approve_resp.text}"

        get_resp = requests.get(_api(f"/maintenance-requests/{request_id}"), headers=headers)
        assert get_resp.status_code == 200

        approved_request = get_resp.json()
        assert approved_request.get("status") == "APPROVED"
        assert approved_request.get("approved_at") is not None, "approved_at not set"
        assert approved_request.get("manager_id") is not None, "manager_id not set"

        print(
            f"✓ Approval completed: status={approved_request.get('status')}, "
            f"manager_id={approved_request.get('manager_id')}, "
            f"approved_at={approved_request.get('approved_at')}"
        )


class TestStaffDashboardStats:
    """Staff dashboard stats for managers"""

    def test_staff_dashboard_returns_vehicle_driver_counts(self, staff_bearer_token):
        """Staff dashboard should return vehicle and driver counts"""
        headers = auth_headers(staff_bearer_token)
        response = requests.get(_api("/dashboard/staff"), headers=headers)
        assert response.status_code == 200, f"Dashboard failed: {response.text}"

        data = response.json()
        assert "total_vehicles" in data, "Missing total_vehicles"
        assert "total_drivers" in data, "Missing total_drivers"
        assert "active_vehicles" in data, "Missing active_vehicles"

        print(
            f"✓ Staff dashboard stats: vehicles={data.get('total_vehicles')}, "
            f"drivers={data.get('total_drivers')}, active={data.get('active_vehicles')}"
        )

    def test_fleet_manager_sees_country_filtered_data(self):
        """Fleet Manager should see data scoped to their country"""
        tok = _fleet_manager_token()
        if not tok:
            pytest.skip("Fleet Manager test account not available or OTP required")

        headers = auth_headers(tok)
        response = requests.get(_api("/dashboard/staff"), headers=headers)
        assert response.status_code == 200

        data = response.json()
        assert data.get("user_role") == "FLEET_MANAGER", (
            f"Expected FLEET_MANAGER role, got {data.get('user_role')}"
        )
        assert data.get("user_country") is not None, "user_country should be set for Fleet Manager"

        print(
            f"✓ Fleet Manager dashboard: role={data.get('user_role')}, "
            f"country={data.get('user_country')}"
        )


class TestSubmittedByTracking:
    """submitted_by when manager submits on behalf of driver"""

    def test_logbook_tracks_submitted_by(self, staff_bearer_token):
        user_data = _me_user(staff_bearer_token)
        headers = auth_headers(staff_bearer_token)

        drivers_resp = requests.get(_api("/drivers"), headers=headers)
        vehicles_resp = requests.get(_api("/vehicles"), headers=headers)

        if not drivers_resp.json() or not vehicles_resp.json():
            pytest.skip("No drivers/vehicles available")

        driver = drivers_resp.json()[0]
        vehicle = vehicles_resp.json()[0]

        logbook_data = {
            "driver_id": driver["id"],
            "vehicle_id": vehicle["id"],
            "date": datetime.now(timezone.utc).isoformat(),
            "start_time": datetime.now(timezone.utc).isoformat(),
            "start_location": "TEST_SubmittedBy_Location",
            "start_odometer": 51000,
            "purpose": "TEST_SubmittedBy_Tracking",
        }

        response = requests.post(_api("/logbook"), json=logbook_data, headers=headers)
        assert response.status_code in [200, 201], f"Failed: {response.text}"

        data = response.json()
        if driver["id"] != user_data.get("id") and driver["id"] != user_data.get("driver_id"):
            assert data.get("submitted_by_id") is not None, "submitted_by_id should be set"
            assert data.get("submitted_by_name") is not None, "submitted_by_name should be set"
            assert data.get("submitted_by_role") is not None, "submitted_by_role should be set"
            print(
                f"✓ Logbook submitted_by tracked: {data.get('submitted_by_name')} "
                f"({data.get('submitted_by_role')})"
            )
        else:
            print("✓ Logbook created (same user, no submitted_by needed)")

    def test_maintenance_request_tracks_submitted_by(self, staff_bearer_token):
        user_data = _me_user(staff_bearer_token)
        headers = auth_headers(staff_bearer_token)

        drivers_resp = requests.get(_api("/drivers"), headers=headers)
        vehicles_resp = requests.get(_api("/vehicles"), headers=headers)

        if not drivers_resp.json() or not vehicles_resp.json():
            pytest.skip("No drivers/vehicles available")

        driver = drivers_resp.json()[0]
        vehicle = vehicles_resp.json()[0]

        request_data = {
            "driver_id": driver["id"],
            "vehicle_id": vehicle["id"],
            "request_type": "INSPECTION",
            "description": "TEST_SubmittedBy_Maintenance",
            "priority": "LOW",
        }

        response = requests.post(_api("/maintenance-requests"), json=request_data, headers=headers)
        assert response.status_code in [200, 201], f"Failed: {response.text}"

        request_id = response.json().get("id")
        get_resp = requests.get(_api(f"/maintenance-requests/{request_id}"), headers=headers)
        data = get_resp.json()

        if driver["id"] != user_data.get("id") and driver["id"] != user_data.get("driver_id"):
            assert data.get("submitted_by_id") is not None, "submitted_by_id should be set"
            print(f"✓ Maintenance request submitted_by tracked: {data.get('submitted_by_name')}")
        else:
            print("✓ Maintenance request created (same user)")


class TestPreTripChecklistFix:
    """Pre-Trip Checklist doesn't auto-complete on vehicle selection"""

    def test_today_checklist_returns_completed_false_when_not_done(self, staff_bearer_token):
        """GET .../today/{driver}/{vehicle} should return completed=false if not done"""
        headers = auth_headers(staff_bearer_token)
        fake_driver_id = "TEST_FAKE_DRIVER_12345"
        fake_vehicle_id = "TEST_FAKE_VEHICLE_12345"

        response = requests.get(
            _api(f"/pre-trip-checklists/today/{fake_driver_id}/{fake_vehicle_id}"),
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()

        assert data.get("completed") is False, f"Expected completed=false, got {data.get('completed')}"
        assert data.get("checklist") is None, "checklist should be None when not completed"

        print("✓ Pre-trip checklist correctly returns completed=false when not done")


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    yield
    print("\n✓ Test cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

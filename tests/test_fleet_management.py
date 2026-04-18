"""
Fleet Management System - Comprehensive Backend Tests
Tests for: Authentication, Dashboard, Maintenance Requests, Pre-Trip Checklist,
Tire Management, Driver Logbook, Vendor Management, TCO/Reports, Vehicle Locations

Requires a running API and (session-scoped) staff_bearer_token from conftest.py:
  TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD (or TEST_GROUP_MANAGER_*), or BOOTSTRAP_TOKEN on empty DB.
"""
import os
import uuid
from datetime import datetime, timedelta

import pytest
import requests

from tests.http_helpers import auth_headers, register_self_service

# Set by module autouse fixture (requires REACT_APP_BACKEND_URL or BACKEND_URL).
API = ""

# Test data storage for cleanup
test_data = {
    "user_id": None,
    "token": None,
    "vehicle_id": None,
    "driver_id": None,
    "tire_id": None,
    "vendor_id": None,
    "maintenance_request_id": None,
    "logbook_entry_id": None,
}


def _auth():
    if not test_data.get("token"):
        return {}
    return auth_headers(test_data["token"])


@pytest.fixture(scope="module", autouse=True)
def _fleet_module_setup(api_url, staff_bearer_token):
    """Resolve API base and staff JWT for all tests in this module."""
    global API
    API = api_url
    test_data["token"] = staff_bearer_token


class TestAuthentication:
    """Test authentication endpoints: register, login, token persistence"""

    def test_self_register_user_pending(self):
        """Public registration is USER/DRIVER only; no token until approval."""
        unique_email = f"TEST_user_{uuid.uuid4().hex[:8]}@gti.com"
        response = register_self_service(
            API,
            email=unique_email,
            password="TestPass123!",
            full_name="TEST Self Registered User",
            role="USER",
            country="Ghana",
        )
        assert response.status_code == 201, f"Registration failed: {response.text}"
        data = response.json()
        assert data.get("status") == "pending_approval"
        assert "access_token" not in data
        assert data["user"]["email"] == unique_email
        assert data["user"]["role"] == "USER"
        assert data["user"]["is_approved"] is False
        print(f"✓ Self-register pending approval: {unique_email}")

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(
            f"{API}/auth/login",
            json={"email": "nonexistent@test.com", "password": "wrongpassword"},
        )
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")

    def test_login_with_credentials(self):
        """Optional: login as env admin (skips if OTP required)."""
        admin_email = os.environ.get("TEST_ADMIN_EMAIL", "admin@gti.com")
        admin_password = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
        response = requests.post(
            f"{API}/auth/login", json={"email": admin_email, "password": admin_password}
        )
        if response.status_code != 200:
            pytest.skip(f"Login not available for {admin_email}: {response.text}")
        data = response.json()
        if data.get("requires_otp"):
            pytest.skip("GFM OTP flow not automated in this suite")
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        test_data["token"] = data["access_token"]
        print(f"✓ Login successful for: {data['user']['email']}")

    def test_token_persistence_get_me(self):
        """Verify token works for authenticated requests (staff JWT or post-login)."""
        if not test_data["token"]:
            pytest.skip("No token available")
        response = requests.get(f"{API}/auth/me", headers=_auth())
        assert response.status_code == 200, f"Get me failed: {response.text}"
        data = response.json()
        assert "email" in data
        assert "role" in data
        print(f"✓ Token persistence verified for: {data['email']}")


class TestDashboard:
    """Test dashboard endpoints: stats, alerts, compliance"""

    def test_dashboard_stats_loading(self):
        response = requests.get(f"{API}/dashboard/stats", headers=_auth())
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        assert "total_vehicles" in data
        assert "total_drivers" in data
        assert "pending_maintenance" in data
        assert "total_fleet_value_usd" in data
        assert "vehicles_by_country" in data
        print(
            f"✓ Dashboard stats loaded: {data['total_vehicles']} vehicles, {data['total_drivers']} drivers"
        )

    def test_dashboard_stats_with_country_filter(self):
        response = requests.get(f"{API}/dashboard/stats?country=GHANA", headers=_auth())
        assert response.status_code == 200, f"Dashboard stats with filter failed: {response.text}"
        data = response.json()
        assert "total_vehicles" in data
        print(f"✓ Dashboard stats for GHANA: {data['total_vehicles']} vehicles")

    def test_dashboard_alerts_panel(self):
        response = requests.get(f"{API}/dashboard/alerts", headers=_auth())
        assert response.status_code == 200, f"Dashboard alerts failed: {response.text}"
        data = response.json()
        assert "alerts" in data
        assert "total_count" in data
        assert "critical_count" in data
        assert "warning_count" in data
        print(
            f"✓ Dashboard alerts loaded: {data['total_count']} total, {data['critical_count']} critical"
        )

    def test_dashboard_compliance_status(self):
        response = requests.get(f"{API}/dashboard/compliance", headers=_auth())
        assert response.status_code == 200, f"Dashboard compliance failed: {response.text}"
        data = response.json()
        assert "items" in data
        assert "summary" in data
        assert "compliance_rate" in data["summary"]
        print(f"✓ Compliance status loaded: {data['summary']['compliance_rate']}% compliance rate")


class TestMaintenanceRequests:
    """Test maintenance request workflow: submit, approve/reject"""

    @pytest.fixture(autouse=True)
    def setup_test_data(self):
        vehicle_response = requests.post(
            f"{API}/vehicles",
            json={
                "country": "GHANA",
                "registration_number": f"TEST-MR-{uuid.uuid4().hex[:6]}",
                "make": "Toyota",
                "model": "Hilux",
                "year": 2022,
                "vin": f"VIN{uuid.uuid4().hex[:10]}",
                "acquisition_date": datetime.now().isoformat(),
                "acquisition_cost": 50000,
                "acquisition_currency": "GHS",
            },
            headers=_auth(),
        )
        if vehicle_response.status_code == 200:
            test_data["vehicle_id"] = vehicle_response.json()["id"]

        driver_response = requests.post(
            f"{API}/drivers",
            json={
                "country": "GHANA",
                "first_name": "TEST",
                "last_name": "Driver",
                "license_number": f"LIC{uuid.uuid4().hex[:8]}",
                "license_expiry": (datetime.now() + timedelta(days=365)).isoformat(),
                "phone": "+233123456789",
            },
            headers=_auth(),
        )
        if driver_response.status_code == 200:
            test_data["driver_id"] = driver_response.json()["id"]

    def test_submit_maintenance_request(self):
        if not test_data.get("vehicle_id") or not test_data.get("driver_id"):
            pytest.skip("Test vehicle/driver not created")
        response = requests.post(
            f"{API}/maintenance-requests",
            json={
                "vehicle_id": test_data["vehicle_id"],
                "driver_id": test_data["driver_id"],
                "request_type": "Oil Change",
                "description": "TEST: Regular oil change needed",
                "priority": "MEDIUM",
                "estimated_cost": 500,
                "currency": "GHS",
            },
            headers=_auth(),
        )
        assert response.status_code == 200, f"Submit request failed: {response.text}"
        data = response.json()
        assert data["status"] == "PENDING"
        assert data["request_type"] == "Oil Change"
        assert data["priority"] == "MEDIUM"
        test_data["maintenance_request_id"] = data["id"]
        print(f"✓ Maintenance request submitted: {data['id']}")

    def test_get_maintenance_requests(self):
        response = requests.get(f"{API}/maintenance-requests", headers=_auth())
        assert response.status_code == 200, f"Get requests failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} maintenance requests")

    def test_get_pending_maintenance_requests(self):
        response = requests.get(f"{API}/maintenance-requests?status=PENDING", headers=_auth())
        assert response.status_code == 200, f"Get pending requests failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        for req in data:
            assert req["status"] == "PENDING"
        print(f"✓ Retrieved {len(data)} pending maintenance requests")

    def test_approve_maintenance_request(self):
        if not test_data.get("maintenance_request_id"):
            pytest.skip("No maintenance request to approve")
        response = requests.post(
            f"{API}/maintenance-requests/{test_data['maintenance_request_id']}/approve",
            json={
                "manager_id": test_data.get("user_id", "test-manager"),
                "approved": True,
            },
            headers=_auth(),
        )
        assert response.status_code == 200, f"Approve request failed: {response.text}"
        data = response.json()
        assert data["status"] == "success"
        print("✓ Maintenance request approved")

    def test_reject_maintenance_request(self):
        if not test_data.get("vehicle_id") or not test_data.get("driver_id"):
            pytest.skip("Test vehicle/driver not created")
        create_response = requests.post(
            f"{API}/maintenance-requests",
            json={
                "vehicle_id": test_data["vehicle_id"],
                "driver_id": test_data["driver_id"],
                "request_type": "Tire Replacement",
                "description": "TEST: Request to be rejected",
                "priority": "LOW",
            },
            headers=_auth(),
        )
        if create_response.status_code != 200:
            pytest.skip("Could not create request to reject")
        request_id = create_response.json()["id"]
        response = requests.post(
            f"{API}/maintenance-requests/{request_id}/approve",
            json={
                "manager_id": "test-manager",
                "approved": False,
                "rejection_reason": "TEST: Budget constraints",
            },
            headers=_auth(),
        )
        assert response.status_code == 200, f"Reject request failed: {response.text}"
        print("✓ Maintenance request rejected with reason")


class TestPreTripChecklist:
    """Test pre-trip checklist functionality"""

    def test_complete_checklist(self):
        if not test_data.get("vehicle_id") or not test_data.get("driver_id"):
            vehicle_response = requests.post(
                f"{API}/vehicles",
                json={
                    "country": "GHANA",
                    "registration_number": f"TEST-PTC-{uuid.uuid4().hex[:6]}",
                    "make": "Toyota",
                    "model": "Land Cruiser",
                    "year": 2021,
                    "vin": f"VIN{uuid.uuid4().hex[:10]}",
                    "acquisition_date": datetime.now().isoformat(),
                    "acquisition_cost": 80000,
                    "acquisition_currency": "GHS",
                },
                headers=_auth(),
            )
            if vehicle_response.status_code == 200:
                test_data["vehicle_id"] = vehicle_response.json()["id"]
            driver_response = requests.post(
                f"{API}/drivers",
                json={
                    "country": "GHANA",
                    "first_name": "TEST",
                    "last_name": "ChecklistDriver",
                    "license_number": f"LIC{uuid.uuid4().hex[:8]}",
                    "license_expiry": (datetime.now() + timedelta(days=365)).isoformat(),
                    "phone": "+233987654321",
                },
                headers=_auth(),
            )
            if driver_response.status_code == 200:
                test_data["driver_id"] = driver_response.json()["id"]
        if not test_data.get("vehicle_id") or not test_data.get("driver_id"):
            pytest.skip("Could not create test vehicle/driver")
        response = requests.post(
            f"{API}/pre-trip-checklists",
            json={
                "driver_id": test_data["driver_id"],
                "vehicle_id": test_data["vehicle_id"],
                "engine_oil": "OK",
                "tires": "OK",
                "brakes": "OK",
                "lights": "OK",
                "fuel_level": "OK",
                "mirrors_wipers": "OK",
                "cleanliness_damage": "NEEDS_ATTENTION",
                "cleanliness_damage_notes": "TEST: Minor scratch on rear bumper",
                "additional_notes": "TEST: Vehicle ready for trip",
            },
            headers=_auth(),
        )
        if response.status_code == 400 and "already completed" in response.text:
            print("✓ Checklist already completed for today (expected behavior)")
            return
        assert response.status_code == 200, f"Create checklist failed: {response.text}"
        data = response.json()
        assert data["completed"] is True
        assert "overall_status" in data
        print(f"✓ Pre-trip checklist completed: {data['overall_status']}")

    def test_get_checklists(self):
        response = requests.get(f"{API}/pre-trip-checklists", headers=_auth())
        assert response.status_code == 200, f"Get checklists failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} pre-trip checklists")

    def test_check_today_checklist(self):
        if not test_data.get("vehicle_id") or not test_data.get("driver_id"):
            pytest.skip("No test vehicle/driver")
        response = requests.get(
            f"{API}/pre-trip-checklists/today/{test_data['driver_id']}/{test_data['vehicle_id']}",
            headers=_auth(),
        )
        assert response.status_code == 200, f"Check today checklist failed: {response.text}"
        data = response.json()
        assert "completed" in data
        assert "can_log_trips" in data
        print(
            f"✓ Today's checklist status: completed={data['completed']}, can_log_trips={data['can_log_trips']}"
        )


class TestTireManagement:
    """Test tire management: add tire, view by vehicle"""

    def test_add_tire(self):
        response = requests.post(
            f"{API}/tires",
            json={
                "serial_number": f"TEST-TIRE-{uuid.uuid4().hex[:8]}",
                "brand": "Michelin",
                "model": "Defender LTX",
                "size": "265/70R17",
                "country": "GHANA",
                "purchase_date": datetime.now().isoformat(),
                "purchase_cost": 800,
                "currency": "GHS",
                "tread_depth_mm": 10.0,
                "notes": "TEST: New tire for testing",
            },
            headers=_auth(),
        )
        assert response.status_code == 200, f"Add tire failed: {response.text}"
        data = response.json()
        assert data["brand"] == "Michelin"
        assert data["status"] == "SPARE"
        test_data["tire_id"] = data["id"]
        print(f"✓ Tire added: {data['serial_number']}")

    def test_get_all_tires(self):
        response = requests.get(f"{API}/tires", headers=_auth())
        assert response.status_code == 200, f"Get tires failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} tires")

    def test_get_tires_by_country(self):
        response = requests.get(f"{API}/tires?country=GHANA", headers=_auth())
        assert response.status_code == 200, f"Get tires by country failed: {response.text}"
        data = response.json()
        for tire in data:
            assert tire["country"] == "GHANA"
        print(f"✓ Retrieved {len(data)} tires for GHANA")

    def test_get_tire_by_id(self):
        if not test_data.get("tire_id"):
            pytest.skip("No tire created")
        response = requests.get(f"{API}/tires/{test_data['tire_id']}", headers=_auth())
        assert response.status_code == 200, f"Get tire failed: {response.text}"
        data = response.json()
        assert data["id"] == test_data["tire_id"]
        print(f"✓ Retrieved tire: {data['serial_number']}")

    def test_update_tire(self):
        if not test_data.get("tire_id"):
            pytest.skip("No tire created")
        response = requests.put(
            f"{API}/tires/{test_data['tire_id']}",
            json={"tread_depth_mm": 8.5, "notes": "TEST: Updated tread depth"},
            headers=_auth(),
        )
        assert response.status_code == 200, f"Update tire failed: {response.text}"
        print("✓ Tire updated successfully")


class TestDriverLogbook:
    """Test driver logbook: add entry, view summary"""

    def test_add_logbook_entry(self):
        if not test_data.get("vehicle_id") or not test_data.get("driver_id"):
            pytest.skip("No test vehicle/driver")
        now = datetime.now()
        response = requests.post(
            f"{API}/logbook",
            json={
                "driver_id": test_data["driver_id"],
                "vehicle_id": test_data["vehicle_id"],
                "country": "GHANA",
                "date": now.isoformat(),
                "start_time": now.isoformat(),
                "end_time": (now + timedelta(hours=4)).isoformat(),
                "start_location": "Accra Office",
                "end_location": "Tema Port",
                "start_odometer": 50000,
                "end_odometer": 50080,
                "purpose": "TEST: Delivery run",
                "fuel_used_liters": 12.5,
                "average_speed_kmh": 45,
                "max_speed_kmh": 80,
                "speed_limit_violations": 0,
                "notes": "TEST: Smooth trip",
            },
            headers=_auth(),
        )
        assert response.status_code == 200, f"Add logbook entry failed: {response.text}"
        data = response.json()
        assert data["purpose"] == "TEST: Delivery run"
        assert data["distance_km"] == 80
        test_data["logbook_entry_id"] = data["id"]
        print(f"✓ Logbook entry added: {data['id']}")

    def test_get_logbook_entries(self):
        response = requests.get(f"{API}/logbook", headers=_auth())
        assert response.status_code == 200, f"Get logbook failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} logbook entries")

    def test_get_logbook_by_driver(self):
        if not test_data.get("driver_id"):
            pytest.skip("No test driver")
        response = requests.get(
            f"{API}/logbook?driver_id={test_data['driver_id']}", headers=_auth()
        )
        assert response.status_code == 200, f"Get driver logbook failed: {response.text}"
        data = response.json()
        for entry in data:
            assert entry["driver_id"] == test_data["driver_id"]
        print(f"✓ Retrieved {len(data)} entries for driver")

    def test_get_driver_logbook_summary(self):
        if not test_data.get("driver_id"):
            pytest.skip("No test driver")
        response = requests.get(
            f"{API}/logbook/summary/{test_data['driver_id']}", headers=_auth()
        )
        assert response.status_code == 200, f"Get summary failed: {response.text}"
        data = response.json()
        assert "total_trips" in data
        assert "total_distance_km" in data
        assert "total_fuel_liters" in data
        assert "speed_violations" in data
        print(f"✓ Driver summary: {data['total_trips']} trips, {data['total_distance_km']} km")


class TestVendorManagement:
    """Test vendor management: add vendor, toggle preferred"""

    def test_add_vendor(self):
        response = requests.post(
            f"{API}/vendors",
            json={
                "name": f"TEST Vendor {uuid.uuid4().hex[:6]}",
                "category": "FUEL",
                "country": "GHANA",
                "address": "123 Test Street",
                "city": "Accra",
                "contact_person": "John Test",
                "phone": "+233123456789",
                "email": "test@vendor.com",
                "payment_terms": "NET30",
                "is_preferred": False,
                "currency": "GHS",
                "notes": "TEST: Test vendor",
            },
            headers=_auth(),
        )
        assert response.status_code == 200, f"Add vendor failed: {response.text}"
        data = response.json()
        assert data["category"] == "FUEL"
        assert data["is_preferred"] is False
        test_data["vendor_id"] = data["id"]
        print(f"✓ Vendor added: {data['name']}")

    def test_get_all_vendors(self):
        response = requests.get(f"{API}/vendors", headers=_auth())
        assert response.status_code == 200, f"Get vendors failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} vendors")

    def test_get_vendors_by_category(self):
        response = requests.get(f"{API}/vendors?category=FUEL", headers=_auth())
        assert response.status_code == 200, f"Get vendors by category failed: {response.text}"
        data = response.json()
        for vendor in data:
            assert vendor["category"] == "FUEL"
        print(f"✓ Retrieved {len(data)} FUEL vendors")

    def test_toggle_preferred_vendor(self):
        if not test_data.get("vendor_id"):
            pytest.skip("No vendor created")
        response = requests.put(
            f"{API}/vendors/{test_data['vendor_id']}",
            json={"is_preferred": True},
            headers=_auth(),
        )
        assert response.status_code == 200, f"Toggle preferred failed: {response.text}"
        get_response = requests.get(f"{API}/vendors/{test_data['vendor_id']}", headers=_auth())
        assert get_response.status_code == 200
        data = get_response.json()
        assert data["is_preferred"] is True
        print("✓ Vendor marked as preferred")


class TestTCOReports:
    """Test TCO calculation and expense breakdown"""

    def test_get_vehicle_tco(self):
        if not test_data.get("vehicle_id"):
            pytest.skip("No test vehicle")
        response = requests.get(
            f"{API}/tco/vehicle/{test_data['vehicle_id']}", headers=_auth()
        )
        assert response.status_code == 200, f"Get vehicle TCO failed: {response.text}"
        data = response.json()
        assert "costs" in data
        assert "metrics" in data
        assert "cost_per_km_usd" in data.get("metrics", {})
        cost_per_km = data.get("metrics", {}).get("cost_per_km_usd", 0)
        print(f"✓ Vehicle TCO: ${data['costs'].get('total', 0)} total, ${cost_per_km}/km")

    def test_get_fleet_tco(self):
        response = requests.get(f"{API}/tco/fleet", headers=_auth())
        assert response.status_code == 200, f"Get fleet TCO failed: {response.text}"
        data = response.json()
        assert "costs" in data
        assert "vehicle_count" in data
        assert "total_distance_km" in data
        print(
            f"✓ Fleet TCO: ${data['costs'].get('total', 0)} total for {data['vehicle_count']} vehicles"
        )

    def test_get_expense_breakdown(self):
        response = requests.get(f"{API}/reports/expense-breakdown", headers=_auth())
        assert response.status_code == 200, f"Get expense breakdown failed: {response.text}"
        data = response.json()
        assert "breakdown" in data
        assert "total_usd" in data
        print(f"✓ Expense breakdown: ${data['total_usd']} total")

    def test_get_utilization_report(self):
        response = requests.get(f"{API}/reports/utilization", headers=_auth())
        assert response.status_code == 200, f"Get utilization report failed: {response.text}"
        data = response.json()
        assert "vehicles" in data
        assert "fleet_avg_utilization" in data
        print(f"✓ Utilization report: {data['fleet_avg_utilization']}% fleet average")


class TestVehicleLocations:
    """Test vehicle location map functionality"""

    def test_add_manual_location(self):
        if not test_data.get("vehicle_id"):
            pytest.skip("No test vehicle")
        response = requests.post(
            f"{API}/vehicle-locations",
            json={
                "vehicle_id": test_data["vehicle_id"],
                "latitude": 5.6037,
                "longitude": -0.1870,
                "address": "Accra Central",
                "city": "Accra",
                "country": "GHANA",
                "source": "MANUAL",
            },
            headers=_auth(),
        )
        assert response.status_code == 200, f"Add location failed: {response.text}"
        data = response.json()
        assert data["source"] == "MANUAL"
        assert data["latitude"] == 5.6037
        print(f"✓ Location added: {data['address']}")

    def test_get_vehicle_locations(self):
        response = requests.get(f"{API}/vehicle-locations", headers=_auth())
        assert response.status_code == 200, f"Get locations failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} vehicle locations")

    def test_get_vehicle_location_history(self):
        if not test_data.get("vehicle_id"):
            pytest.skip("No test vehicle")
        response = requests.get(
            f"{API}/vehicle-locations/{test_data['vehicle_id']}/history", headers=_auth()
        )
        assert response.status_code == 200, f"Get location history failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} location history entries")


class TestFleetManagers:
    """Test fleet manager endpoints"""

    def test_create_fleet_manager(self):
        response = requests.post(
            f"{API}/fleet-managers",
            json={
                "name": f"TEST Manager {uuid.uuid4().hex[:6]}",
                "email": f"test_manager_{uuid.uuid4().hex[:6]}@gti.com",
                "phone": "+233123456789",
                "country": "GHANA",
            },
            headers=_auth(),
        )
        assert response.status_code == 200, f"Create fleet manager failed: {response.text}"
        data = response.json()
        assert data["is_active"] is True
        print(f"✓ Fleet manager created: {data['name']}")

    def test_get_fleet_managers(self):
        response = requests.get(f"{API}/fleet-managers", headers=_auth())
        assert response.status_code == 200, f"Get fleet managers failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} fleet managers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

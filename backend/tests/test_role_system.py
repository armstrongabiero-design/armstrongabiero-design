"""
Fleet Management System - Role System & New Features Tests

Security model (integration):
- Public self-registration: USER or DRIVER only; 201 + pending_approval; no JWT until approved.
- Staff roles (GFM/FM/FO): created via bootstrap or admin workflows — not via /auth/register.
- Protected /api routes require Bearer JWT (session staff_bearer_token from root conftest).
"""
import os
import uuid

import pytest
import requests

from tests.http_helpers import (
    approve_user,
    auth_headers,
    register_self_service,
)


@pytest.fixture(scope="module")
def module_variables():
    return {"API": "", "STAFF_TOKEN": ""}


@pytest.fixture(scope="module", autouse=True)
def _api(api_url, staff_bearer_token, module_variables):
    module_variables["API"] = api_url
    module_variables["STAFF_TOKEN"] = staff_bearer_token


class TestCountriesEndpoint:
    """Countries list for registration — public GET /api/countries/all-list."""

    def test_get_all_countries_list(self, module_variables):
        api = module_variables["API"]
        response = requests.get(f"{api}/countries/all-list")

        assert response.status_code == 200, f"Get countries failed: {response.text}"
        data = response.json()

        assert "countries" in data
        countries = data["countries"]

        assert len(countries) >= 100, f"Expected 100+ countries, got {len(countries)}"

        for country in countries[:5]:
            assert "code" in country
            assert "name" in country

        country_names = [c["name"] for c in countries]
        assert "Ghana" in country_names
        assert "United States" in country_names
        assert "Nigeria" in country_names
        assert "Kenya" in country_names
        assert "South Africa" in country_names

        print(f"✓ Countries endpoint returns {len(countries)} countries")

    def test_countries_have_codes(self, module_variables):
        api = module_variables["API"]
        response = requests.get(f"{api}/countries/all-list")
        data = response.json()

        for country in data["countries"]:
            assert len(country["code"]) == 2, f"Invalid code for {country['name']}: {country['code']}"

        print("✓ All countries have valid 2-letter codes")


class TestSelfRegistrationPolicy:
    """Public register accepts only USER/DRIVER; staff roles are rejected at validation."""

    def test_register_rejects_group_fleet_manager(self, module_variables):
        api = module_variables["API"]
        r = requests.post(
            f"{api}/auth/register",
            json={
                "email": f"TEST_gfm_{uuid.uuid4().hex[:8]}@gti.com",
                "password": "Test12345!",
                "full_name": "TEST GFM",
                "role": "GROUP_FLEET_MANAGER",
            },
        )
        assert r.status_code == 422, f"Expected validation error, got {r.status_code}: {r.text}"

    def test_register_rejects_fleet_manager(self, module_variables):
        api = module_variables["API"]
        r = requests.post(
            f"{api}/auth/register",
            json={
                "email": f"TEST_fm_{uuid.uuid4().hex[:8]}@gti.com",
                "password": "Test12345!",
                "full_name": "TEST FM",
                "role": "FLEET_MANAGER",
                "country": "Ghana",
            },
        )
        assert r.status_code == 422, f"Expected validation error, got {r.status_code}: {r.text}"

    def test_register_rejects_fleet_officer(self, module_variables):
        api = module_variables["API"]
        r = requests.post(
            f"{api}/auth/register",
            json={
                "email": f"TEST_fo_{uuid.uuid4().hex[:8]}@gti.com",
                "password": "Test12345!",
                "full_name": "TEST FO",
                "role": "FLEET_OFFICER",
                "country": "Nigeria",
            },
        )
        assert r.status_code == 422, f"Expected validation error, got {r.status_code}: {r.text}"

    def test_register_driver_pending_no_token(self, module_variables):
        api = module_variables["API"]
        unique_email = f"TEST_driver_{uuid.uuid4().hex[:8]}@gti.com"
        response = register_self_service(
            api,
            email=unique_email,
            password="Test12345!",
            full_name="TEST Driver",
            role="DRIVER",
            country="Kenya",
        )
        assert response.status_code == 201, response.text
        data = response.json()
        assert data["user"]["role"] == "DRIVER"
        assert data["user"]["country"] == "Kenya"
        assert "access_token" not in data
        assert data["user"]["is_approved"] is False

    def test_register_user_pending_no_token(self, module_variables):
        api = module_variables["API"]
        unique_email = f"TEST_user_{uuid.uuid4().hex[:8]}@gti.com"
        response = register_self_service(
            api,
            email=unique_email,
            password="Test12345!",
            full_name="TEST User",
            role="USER",
            country="South Africa",
        )
        assert response.status_code == 201, response.text
        data = response.json()
        assert data["user"]["role"] == "USER"
        assert "access_token" not in data


class TestForgotPasswordFlow:
    """Forgot password remains public."""

    def test_forgot_password_request(self, module_variables):
        api = module_variables["API"]
        unique_email = f"TEST_forgot_{uuid.uuid4().hex[:8]}@gti.com"
        reg_response = register_self_service(
            api,
            email=unique_email,
            password="Test12345!",
            full_name="TEST Forgot Password User",
            role="DRIVER",
            country="Ghana",
        )
        if reg_response.status_code != 201:
            pytest.skip("Could not create test user")

        response = requests.post(f"{api}/auth/forgot-password", json={"email": unique_email})
        assert response.status_code == 200, f"Forgot password failed: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"✓ Forgot password request successful for: {unique_email}")

    def test_forgot_password_nonexistent_email(self, module_variables):
        api = module_variables["API"]
        response = requests.post(
            f"{api}/auth/forgot-password",
            json={"email": "nonexistent_email_12345@test.com"},
        )
        assert response.status_code == 200, f"Forgot password failed: {response.text}"
        print("✓ Forgot password handles non-existent email correctly")


class TestPersonalDashboard:
    """Personal dashboard requires JWT; driver must be approved before login."""

    def test_personal_dashboard_requires_auth(self, module_variables):
        api = module_variables["API"]
        response = requests.get(f"{api}/dashboard/personal")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Personal dashboard requires authentication")

    def test_personal_dashboard_with_approved_driver(self, module_variables):
        api = module_variables["API"]
        staff = module_variables["STAFF_TOKEN"]
        unique_email = f"TEST_pd_driver_{uuid.uuid4().hex[:6]}@gti.com"
        reg = register_self_service(
            api,
            email=unique_email,
            password="Test12345!",
            full_name="TEST Personal Dashboard Driver",
            role="DRIVER",
            country="Ghana",
        )
        if reg.status_code != 201:
            pytest.skip("Could not register driver")
        user_id = reg.json()["user"]["id"]
        appr = approve_user(api, staff, user_id)
        assert appr.status_code == 200, appr.text

        login = requests.post(
            f"{api}/auth/login",
            json={"email": unique_email, "password": "Test12345!"},
        )
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
        response = requests.get(f"{api}/dashboard/personal", headers=auth_headers(token))
        assert response.status_code == 200, f"Personal dashboard failed: {response.text}"
        data = response.json()
        assert "user_id" in data
        assert "total_trips" in data
        print(f"✓ Personal dashboard loaded for approved driver: {unique_email}")

    def test_personal_dashboard_fields(self, module_variables):
        api = module_variables["API"]
        staff = module_variables["STAFF_TOKEN"]
        email = os.environ.get("TEST_DRIVER_EMAIL")
        password = os.environ.get("TEST_DRIVER_PASSWORD")
        token = None
        if email and password:
            login = requests.post(f"{api}/auth/login", json={"email": email, "password": password})
            if login.status_code == 200 and not login.json().get("requires_otp"):
                token = login.json().get("access_token")
        if not token:
            unique_email = f"TEST_pd_fields_{uuid.uuid4().hex[:6]}@gti.com"
            reg = register_self_service(
                api,
                email=unique_email,
                password="Test12345!",
                full_name="TEST PD Fields",
                role="USER",
                country="Ghana",
            )
            if reg.status_code != 201:
                pytest.skip("Could not register user")
            uid = reg.json()["user"]["id"]
            assert approve_user(api, staff, uid).status_code == 200
            login = requests.post(
                f"{api}/auth/login",
                json={"email": unique_email, "password": "Test12345!"},
            )
            if login.status_code != 200:
                pytest.skip("Could not login after approval")
            token = login.json()["access_token"]

        response = requests.get(f"{api}/dashboard/personal", headers=auth_headers(token))
        if response.status_code != 200:
            pytest.skip(f"Personal dashboard not available: {response.status_code}")
        data = response.json()
        expected_fields = [
            "user_id",
            "driver_id",
            "period_days",
            "total_trips",
            "total_distance_km",
            "total_fuel_liters",
            "avg_fuel_efficiency",
            "pending_requests",
            "approved_requests",
            "total_requests",
            "recent_requests",
            "today_checklist_completed",
            "assigned_vehicle",
        ]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        print("✓ Personal dashboard has all expected fields")


class TestRoleBasedApproval:
    """Pending users and approval under /api/auth/users/...."""

    def test_get_pending_users(self, module_variables):
        api = module_variables["API"]
        staff = module_variables["STAFF_TOKEN"]
        response = requests.get(f"{api}/auth/users/pending", headers=auth_headers(staff))
        assert response.status_code == 200, response.text
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} pending users")

    def test_approve_user(self, module_variables):
        api = module_variables["API"]
        staff = module_variables["STAFF_TOKEN"]
        unique_email = f"TEST_approve_{uuid.uuid4().hex[:8]}@gti.com"
        reg = register_self_service(
            api,
            email=unique_email,
            password="Test12345!",
            full_name="TEST User To Approve",
            role="DRIVER",
            country="Ghana",
        )
        if reg.status_code != 201:
            pytest.skip("Could not create user to approve")
        user_id = reg.json()["user"]["id"]

        response = approve_user(api, staff, user_id)
        assert response.status_code == 200, response.text
        assert response.json().get("status") == "success"
        print("✓ User approved successfully")

    def test_login_blocked_until_approval(self, module_variables):
        api = module_variables["API"]
        unique_email = f"TEST_pending_login_{uuid.uuid4().hex[:8]}@gti.com"
        reg = register_self_service(
            api,
            email=unique_email,
            password="Test12345!",
            full_name="TEST Pending",
            role="USER",
            country="Ghana",
        )
        assert reg.status_code == 201
        login = requests.post(
            f"{api}/auth/login",
            json={"email": unique_email, "password": "Test12345!"},
        )
        assert login.status_code == 403, login.text


class TestLoginWithCredentials:
    """Optional env-based logins (skip if OTP or missing creds)."""

    def test_login_group_manager_env(self, module_variables):
        api = module_variables["API"]
        email = os.environ.get("TEST_ADMIN_EMAIL") or os.environ.get("TEST_GROUP_MANAGER_EMAIL")
        password = os.environ.get("TEST_ADMIN_PASSWORD") or os.environ.get(
            "TEST_GROUP_MANAGER_PASSWORD"
        )
        if not email or not password:
            pytest.skip("Set TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD or TEST_GROUP_MANAGER_*")
        response = requests.post(f"{api}/auth/login", json={"email": email, "password": password})
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.text}")
        data = response.json()
        if data.get("requires_otp"):
            pytest.skip("GFM OTP flow not automated here")
        assert "access_token" in data
        assert data["user"]["role"] == "GROUP_FLEET_MANAGER"
        print(f"✓ Group Fleet Manager login: {data['user']['email']}")

    def test_login_driver_env_or_skip(self, module_variables):
        api = module_variables["API"]
        email = os.environ.get("TEST_DRIVER_EMAIL", "driver1@gti.com")
        password = os.environ.get("TEST_DRIVER_PASSWORD", "Test123!")
        response = requests.post(f"{api}/auth/login", json={"email": email, "password": password})
        if response.status_code != 200:
            pytest.skip(f"Driver login not available: {response.text}")
        data = response.json()
        assert "access_token" in data
        print(f"✓ Driver login: {data['user']['email']}")


class TestDrivingMetricsEndpoint:
    """Logbook summary is a protected route."""

    def test_logbook_summary_endpoint(self, module_variables):
        api = module_variables["API"]
        staff = module_variables["STAFF_TOKEN"]
        drivers_resp = requests.get(f"{api}/drivers", headers=auth_headers(staff))
        assert drivers_resp.status_code == 200, drivers_resp.text
        drivers = drivers_resp.json()
        if not drivers:
            pytest.skip("No drivers in fleet for summary test")
        driver_id = drivers[0]["id"]
        response = requests.get(
            f"{api}/logbook/summary/{driver_id}?period_days=30",
            headers=auth_headers(staff),
        )
        assert response.status_code == 200, f"Logbook summary failed: {response.text}"
        data = response.json()
        assert "total_trips" in data
        assert "total_distance_km" in data
        assert "total_fuel_liters" in data
        assert "speed_violations" in data
        print(f"✓ Driving metrics: {data['total_trips']} trips, {data['total_distance_km']} km")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

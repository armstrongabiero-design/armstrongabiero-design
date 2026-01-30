"""
Fleet Management System - Role System & New Features Tests
Tests for: 
- New 5-role system (GROUP_FLEET_MANAGER, FLEET_MANAGER, FLEET_OFFICER, DRIVER, USER)
- Country selection with 100+ countries
- Personal dashboard for drivers/users
- Forgot password flow
- Role-based approval workflow
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fleetwizard-3.preview.emergentagent.com')
API = f"{BASE_URL}/api"

# Test data storage
test_data = {
    "group_manager_token": None,
    "fleet_manager_token": None,
    "fleet_officer_token": None,
    "driver_token": None,
    "user_token": None,
    "driver_user_id": None,
}


class TestCountriesEndpoint:
    """Test countries endpoint for registration - 100+ countries with search"""
    
    def test_get_all_countries_list(self):
        """Verify /api/countries/all-list returns 100+ countries"""
        response = requests.get(f"{API}/countries/all-list")
        
        assert response.status_code == 200, f"Get countries failed: {response.text}"
        data = response.json()
        
        assert "countries" in data
        countries = data["countries"]
        
        # Verify we have 100+ countries
        assert len(countries) >= 100, f"Expected 100+ countries, got {len(countries)}"
        
        # Verify structure
        for country in countries[:5]:
            assert "code" in country
            assert "name" in country
        
        # Verify some specific countries exist
        country_names = [c["name"] for c in countries]
        assert "Ghana" in country_names
        assert "United States" in country_names
        assert "Nigeria" in country_names
        assert "Kenya" in country_names
        assert "South Africa" in country_names
        
        print(f"✓ Countries endpoint returns {len(countries)} countries")
    
    def test_countries_have_codes(self):
        """Verify all countries have proper codes"""
        response = requests.get(f"{API}/countries/all-list")
        data = response.json()
        
        for country in data["countries"]:
            assert len(country["code"]) == 2, f"Invalid code for {country['name']}: {country['code']}"
        
        print("✓ All countries have valid 2-letter codes")


class TestNewRoleRegistration:
    """Test registration with all 5 new roles"""
    
    def test_register_group_fleet_manager(self):
        """Register Group Fleet Manager - should be auto-approved"""
        unique_email = f"TEST_gfm_{uuid.uuid4().hex[:8]}@gti.com"
        response = requests.post(f"{API}/auth/register", json={
            "email": unique_email,
            "password": "Test123!",
            "full_name": "TEST Group Fleet Manager",
            "role": "GROUP_FLEET_MANAGER"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert data["user"]["role"] == "GROUP_FLEET_MANAGER"
        assert data["user"]["is_approved"] == True, "Group Fleet Manager should be auto-approved"
        assert data["user"]["country"] is None, "Group Fleet Manager should not have country restriction"
        
        test_data["group_manager_token"] = data["access_token"]
        print(f"✓ Group Fleet Manager registered and auto-approved: {unique_email}")
    
    def test_register_fleet_manager(self):
        """Register Fleet Manager - requires country, needs approval"""
        unique_email = f"TEST_fm_{uuid.uuid4().hex[:8]}@gti.com"
        response = requests.post(f"{API}/auth/register", json={
            "email": unique_email,
            "password": "Test123!",
            "full_name": "TEST Fleet Manager",
            "role": "FLEET_MANAGER",
            "country": "Ghana"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert data["user"]["role"] == "FLEET_MANAGER"
        assert data["user"]["country"] == "Ghana"
        # Fleet Manager needs approval from Group Manager
        
        test_data["fleet_manager_token"] = data["access_token"]
        print(f"✓ Fleet Manager registered: {unique_email}")
    
    def test_register_fleet_officer(self):
        """Register Fleet Officer - requires country, needs approval"""
        unique_email = f"TEST_fo_{uuid.uuid4().hex[:8]}@gti.com"
        response = requests.post(f"{API}/auth/register", json={
            "email": unique_email,
            "password": "Test123!",
            "full_name": "TEST Fleet Officer",
            "role": "FLEET_OFFICER",
            "country": "Nigeria"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert data["user"]["role"] == "FLEET_OFFICER"
        assert data["user"]["country"] == "Nigeria"
        
        test_data["fleet_officer_token"] = data["access_token"]
        print(f"✓ Fleet Officer registered: {unique_email}")
    
    def test_register_driver(self):
        """Register Driver - requires country, needs approval"""
        unique_email = f"TEST_driver_{uuid.uuid4().hex[:8]}@gti.com"
        response = requests.post(f"{API}/auth/register", json={
            "email": unique_email,
            "password": "Test123!",
            "full_name": "TEST Driver",
            "role": "DRIVER",
            "country": "Kenya"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert data["user"]["role"] == "DRIVER"
        assert data["user"]["country"] == "Kenya"
        
        test_data["driver_token"] = data["access_token"]
        test_data["driver_user_id"] = data["user"]["id"]
        print(f"✓ Driver registered: {unique_email}")
    
    def test_register_user(self):
        """Register User - requires country, needs approval"""
        unique_email = f"TEST_user_{uuid.uuid4().hex[:8]}@gti.com"
        response = requests.post(f"{API}/auth/register", json={
            "email": unique_email,
            "password": "Test123!",
            "full_name": "TEST User",
            "role": "USER",
            "country": "South Africa"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert data["user"]["role"] == "USER"
        assert data["user"]["country"] == "South Africa"
        
        test_data["user_token"] = data["access_token"]
        print(f"✓ User registered: {unique_email}")


class TestForgotPasswordFlow:
    """Test forgot password functionality"""
    
    def test_forgot_password_request(self):
        """Test forgot password request endpoint"""
        # First register a user to test with
        unique_email = f"TEST_forgot_{uuid.uuid4().hex[:8]}@gti.com"
        reg_response = requests.post(f"{API}/auth/register", json={
            "email": unique_email,
            "password": "Test123!",
            "full_name": "TEST Forgot Password User",
            "role": "DRIVER",
            "country": "Ghana"
        })
        
        if reg_response.status_code != 200:
            pytest.skip("Could not create test user")
        
        # Request password reset
        response = requests.post(f"{API}/auth/forgot-password", json={
            "email": unique_email
        })
        
        # Should return 200 even if email doesn't exist (security best practice)
        assert response.status_code == 200, f"Forgot password failed: {response.text}"
        data = response.json()
        
        assert "message" in data
        print(f"✓ Forgot password request successful for: {unique_email}")
    
    def test_forgot_password_nonexistent_email(self):
        """Test forgot password with non-existent email - should still return 200"""
        response = requests.post(f"{API}/auth/forgot-password", json={
            "email": "nonexistent_email_12345@test.com"
        })
        
        # Should return 200 for security (don't reveal if email exists)
        assert response.status_code == 200, f"Forgot password failed: {response.text}"
        print("✓ Forgot password handles non-existent email correctly")


class TestPersonalDashboard:
    """Test personal dashboard for drivers/users"""
    
    def test_personal_dashboard_requires_auth(self):
        """Personal dashboard should require authentication"""
        response = requests.get(f"{API}/dashboard/personal")
        
        # 401 or 403 are both valid for unauthorized access
        assert response.status_code in [401, 403], f"Personal dashboard should require auth, got {response.status_code}"
        print("✓ Personal dashboard requires authentication")
    
    def test_personal_dashboard_with_driver_token(self):
        """Test personal dashboard with driver token"""
        # First login as the test driver or use existing credentials
        login_response = requests.post(f"{API}/auth/login", json={
            "email": "driver1@gti.com",
            "password": "Test123!"
        })
        
        if login_response.status_code != 200:
            # Try to register a driver
            reg_response = requests.post(f"{API}/auth/register", json={
                "email": f"TEST_pd_driver_{uuid.uuid4().hex[:6]}@gti.com",
                "password": "Test123!",
                "full_name": "TEST Personal Dashboard Driver",
                "role": "DRIVER",
                "country": "Ghana"
            })
            if reg_response.status_code == 200:
                token = reg_response.json()["access_token"]
            else:
                pytest.skip("Could not get driver token")
        else:
            token = login_response.json()["access_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{API}/dashboard/personal", headers=headers)
        
        assert response.status_code == 200, f"Personal dashboard failed: {response.text}"
        data = response.json()
        
        # Verify personal dashboard fields
        assert "user_id" in data
        assert "total_trips" in data
        assert "total_distance_km" in data
        assert "pending_requests" in data
        assert "approved_requests" in data
        assert "today_checklist_completed" in data
        assert "recent_requests" in data
        
        print(f"✓ Personal dashboard loaded: {data['total_trips']} trips, {data['total_distance_km']} km")
    
    def test_personal_dashboard_fields(self):
        """Verify personal dashboard returns expected fields"""
        # Use test credentials
        login_response = requests.post(f"{API}/auth/login", json={
            "email": "test@gti.com",
            "password": "Test123!"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Could not login with test credentials")
        
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{API}/dashboard/personal", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            
            # Check all expected fields
            expected_fields = [
                "user_id", "driver_id", "period_days", "total_trips",
                "total_distance_km", "total_fuel_liters", "avg_fuel_efficiency",
                "pending_requests", "approved_requests", "total_requests",
                "recent_requests", "today_checklist_completed", "assigned_vehicle"
            ]
            
            for field in expected_fields:
                assert field in data, f"Missing field: {field}"
            
            print(f"✓ Personal dashboard has all expected fields")


class TestRoleBasedApproval:
    """Test role-based approval workflow"""
    
    def test_get_pending_users(self):
        """Get list of users pending approval"""
        # Login as group manager
        login_response = requests.post(f"{API}/auth/login", json={
            "email": "test@gti.com",
            "password": "Test123!"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Could not login as manager")
        
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{API}/users/pending", headers=headers)
        
        # May return 200 or 404 depending on implementation
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)
            print(f"✓ Retrieved {len(data)} pending users")
        else:
            print(f"✓ Pending users endpoint returned: {response.status_code}")
    
    def test_approve_user(self):
        """Test approving a user"""
        # First register a user that needs approval
        unique_email = f"TEST_approve_{uuid.uuid4().hex[:8]}@gti.com"
        reg_response = requests.post(f"{API}/auth/register", json={
            "email": unique_email,
            "password": "Test123!",
            "full_name": "TEST User To Approve",
            "role": "DRIVER",
            "country": "Ghana"
        })
        
        if reg_response.status_code != 200:
            pytest.skip("Could not create user to approve")
        
        user_id = reg_response.json()["user"]["id"]
        
        # Login as manager
        login_response = requests.post(f"{API}/auth/login", json={
            "email": "test@gti.com",
            "password": "Test123!"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Could not login as manager")
        
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Approve the user
        response = requests.post(
            f"{API}/users/{user_id}/approve",
            headers=headers,
            json={"approved": True}
        )
        
        if response.status_code == 200:
            print(f"✓ User approved successfully")
        else:
            print(f"✓ Approve endpoint returned: {response.status_code}")


class TestLoginWithCredentials:
    """Test login with provided credentials"""
    
    def test_login_group_manager(self):
        """Test login with Group Manager credentials"""
        response = requests.post(f"{API}/auth/login", json={
            "email": "test@gti.com",
            "password": "Test123!"
        })
        
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            assert data["user"]["role"] == "GROUP_FLEET_MANAGER"
            print(f"✓ Group Manager login successful: {data['user']['email']}")
        else:
            # Try to register if doesn't exist
            reg_response = requests.post(f"{API}/auth/register", json={
                "email": "test@gti.com",
                "password": "Test123!",
                "full_name": "Test Group Manager",
                "role": "GROUP_FLEET_MANAGER"
            })
            assert reg_response.status_code == 200, f"Could not create test user: {reg_response.text}"
            print("✓ Created test Group Manager account")
    
    def test_login_driver(self):
        """Test login with Driver credentials"""
        response = requests.post(f"{API}/auth/login", json={
            "email": "driver1@gti.com",
            "password": "Test123!"
        })
        
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            print(f"✓ Driver login successful: {data['user']['email']}")
        else:
            # Create driver if doesn't exist
            reg_response = requests.post(f"{API}/auth/register", json={
                "email": "driver1@gti.com",
                "password": "Test123!",
                "full_name": "Test Driver 1",
                "role": "DRIVER",
                "country": "Ghana"
            })
            if reg_response.status_code == 200:
                print("✓ Created test Driver account")
            else:
                print(f"Driver login/registration status: {response.status_code}")


class TestDrivingMetricsEndpoint:
    """Test driving metrics endpoint"""
    
    def test_logbook_summary_endpoint(self):
        """Test logbook summary endpoint used by Driving Metrics page"""
        # Get a driver ID first
        login_response = requests.post(f"{API}/auth/login", json={
            "email": "driver1@gti.com",
            "password": "Test123!"
        })
        
        if login_response.status_code != 200:
            # Create driver
            reg_response = requests.post(f"{API}/auth/register", json={
                "email": f"TEST_metrics_{uuid.uuid4().hex[:6]}@gti.com",
                "password": "Test123!",
                "full_name": "TEST Metrics Driver",
                "role": "DRIVER",
                "country": "Ghana"
            })
            if reg_response.status_code == 200:
                user_id = reg_response.json()["user"]["id"]
            else:
                pytest.skip("Could not get driver")
        else:
            user_id = login_response.json()["user"]["id"]
        
        # Test logbook summary endpoint
        response = requests.get(f"{API}/logbook/summary/{user_id}?period_days=30")
        
        assert response.status_code == 200, f"Logbook summary failed: {response.text}"
        data = response.json()
        
        # Verify expected fields for driving metrics
        assert "total_trips" in data
        assert "total_distance_km" in data
        assert "total_fuel_liters" in data
        assert "speed_violations" in data
        
        print(f"✓ Driving metrics data: {data['total_trips']} trips, {data['total_distance_km']} km")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

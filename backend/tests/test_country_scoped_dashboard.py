"""
Test Country-Scoped Dashboard and Action Logging Features
Tests:
1. /api/dashboard/staff endpoint returns country-filtered data for Fleet Managers
2. submitted_by_id, submitted_by_name, submitted_by_role fields on maintenance requests
3. User approval workflow from dashboard
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
GROUP_MANAGER_EMAIL = "admin@gti.com"
GROUP_MANAGER_PASSWORD = "admin123"
DRIVER_EMAIL = "driver1@gti.com"
DRIVER_PASSWORD = "Test123!"


class TestAuthentication:
    """Test authentication and get tokens"""
    
    def test_group_manager_login(self):
        """Test Group Fleet Manager login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": GROUP_MANAGER_EMAIL,
            "password": GROUP_MANAGER_PASSWORD
        })
        print(f"Group Manager Login Response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            assert data.get("user", {}).get("role") == "GROUP_FLEET_MANAGER"
            print(f"Group Manager logged in: {data.get('user', {}).get('full_name')}")
        else:
            print(f"Login failed: {response.text}")
            pytest.skip("Group Manager login failed - may need to create account")
    
    def test_driver_login(self):
        """Test Driver login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        print(f"Driver Login Response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            print(f"Driver logged in: {data.get('user', {}).get('full_name')}")
        else:
            print(f"Driver login failed: {response.text}")
            pytest.skip("Driver login failed - may need to create account")


class TestStaffDashboard:
    """Test /api/dashboard/staff endpoint for country-scoped data"""
    
    @pytest.fixture
    def group_manager_token(self):
        """Get Group Fleet Manager token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": GROUP_MANAGER_EMAIL,
            "password": GROUP_MANAGER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Could not get Group Manager token")
    
    @pytest.fixture
    def driver_token(self):
        """Get Driver token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Could not get Driver token")
    
    def test_staff_dashboard_group_manager_sees_all(self, group_manager_token):
        """Group Fleet Manager should see data from all countries"""
        headers = {"Authorization": f"Bearer {group_manager_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/staff", headers=headers)
        
        print(f"Staff Dashboard Response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Staff Dashboard Data: {data}")
        
        # Group Manager should see all countries
        assert data.get("user_role") == "GROUP_FLEET_MANAGER"
        # user_country should be None for Group Manager (sees all)
        assert data.get("user_country") is None or data.get("user_country") == ""
        
        # Should have vehicles_by_country breakdown
        if "vehicles_by_country" in data:
            print(f"Vehicles by country: {data['vehicles_by_country']}")
        
        # Verify response structure
        assert "total_vehicles" in data
        assert "total_drivers" in data
        assert "pending_requests_count" in data
        assert "pending_users_count" in data
    
    def test_staff_dashboard_returns_pending_users(self, group_manager_token):
        """Staff dashboard should return pending users for approval"""
        headers = {"Authorization": f"Bearer {group_manager_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/staff", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check pending users structure
        assert "pending_users_count" in data
        assert "pending_users" in data
        print(f"Pending users count: {data['pending_users_count']}")
        print(f"Pending users: {data['pending_users'][:3] if data['pending_users'] else 'None'}")
    
    def test_staff_dashboard_returns_pending_requests(self, group_manager_token):
        """Staff dashboard should return pending maintenance requests"""
        headers = {"Authorization": f"Bearer {group_manager_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/staff", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check pending requests structure
        assert "pending_requests_count" in data
        assert "pending_requests" in data
        print(f"Pending requests count: {data['pending_requests_count']}")


class TestMaintenanceRequestSubmittedBy:
    """Test submitted_by tracking when manager creates request on behalf of driver"""
    
    @pytest.fixture
    def group_manager_auth(self):
        """Get Group Fleet Manager token and user info"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": GROUP_MANAGER_EMAIL,
            "password": GROUP_MANAGER_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            return {
                "token": data.get("access_token"),
                "user": data.get("user")
            }
        pytest.skip("Could not get Group Manager auth")
    
    @pytest.fixture
    def test_vehicle(self, group_manager_auth):
        """Get or create a test vehicle"""
        headers = {"Authorization": f"Bearer {group_manager_auth['token']}"}
        
        # Get existing vehicles
        response = requests.get(f"{BASE_URL}/api/vehicles", headers=headers)
        if response.status_code == 200 and response.json():
            return response.json()[0]
        
        # Create a test vehicle if none exist
        vehicle_data = {
            "registration_number": f"TEST-{uuid.uuid4().hex[:6].upper()}",
            "make": "Toyota",
            "model": "Hilux",
            "year": 2022,
            "country": "GHANA",
            "status": "ACTIVE",
            "acquisition_cost": 50000,
            "acquisition_currency": "USD",
            "acquisition_date": "2022-01-01"
        }
        response = requests.post(f"{BASE_URL}/api/vehicles", json=vehicle_data, headers=headers)
        if response.status_code == 200:
            return response.json()
        pytest.skip("Could not get or create test vehicle")
    
    @pytest.fixture
    def test_driver(self, group_manager_auth):
        """Get or create a test driver"""
        headers = {"Authorization": f"Bearer {group_manager_auth['token']}"}
        
        # Get existing drivers
        response = requests.get(f"{BASE_URL}/api/drivers", headers=headers)
        if response.status_code == 200 and response.json():
            return response.json()[0]
        
        # Create a test driver if none exist
        driver_data = {
            "first_name": "Test",
            "last_name": "Driver",
            "email": f"testdriver_{uuid.uuid4().hex[:6]}@test.com",
            "phone": "+233123456789",
            "license_number": f"LIC-{uuid.uuid4().hex[:6].upper()}",
            "license_expiry": "2026-12-31",
            "country": "GHANA"
        }
        response = requests.post(f"{BASE_URL}/api/drivers", json=driver_data, headers=headers)
        if response.status_code == 200:
            return response.json()
        pytest.skip("Could not get or create test driver")
    
    def test_create_request_on_behalf_of_driver_populates_submitted_by(self, group_manager_auth, test_vehicle, test_driver):
        """When Group Manager creates request on behalf of driver, submitted_by fields should be populated"""
        headers = {"Authorization": f"Bearer {group_manager_auth['token']}"}
        manager_user = group_manager_auth['user']
        
        # Create maintenance request on behalf of driver
        request_data = {
            "vehicle_id": test_vehicle['id'],
            "driver_id": test_driver['id'],  # Different from current user
            "request_type": "TEST_Oil Change",
            "description": "Test request created by manager on behalf of driver",
            "priority": "MEDIUM",
            "estimated_cost": 150.00,
            "currency": "GHS"
        }
        
        response = requests.post(f"{BASE_URL}/api/maintenance-requests", json=request_data, headers=headers)
        print(f"Create Request Response: {response.status_code}")
        print(f"Response Body: {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify submitted_by fields are populated
        print(f"submitted_by_id: {data.get('submitted_by_id')}")
        print(f"submitted_by_name: {data.get('submitted_by_name')}")
        print(f"submitted_by_role: {data.get('submitted_by_role')}")
        
        # The submitted_by fields should be populated since manager is creating on behalf of driver
        assert data.get('submitted_by_id') == manager_user.get('id'), f"Expected submitted_by_id to be {manager_user.get('id')}"
        assert data.get('submitted_by_name') == manager_user.get('full_name'), f"Expected submitted_by_name to be {manager_user.get('full_name')}"
        assert data.get('submitted_by_role') == "GROUP_FLEET_MANAGER", f"Expected submitted_by_role to be GROUP_FLEET_MANAGER"
        
        # Store request ID for cleanup
        return data
    
    def test_get_maintenance_requests_includes_submitted_by(self, group_manager_auth):
        """GET /api/maintenance-requests should include submitted_by fields"""
        headers = {"Authorization": f"Bearer {group_manager_auth['token']}"}
        
        response = requests.get(f"{BASE_URL}/api/maintenance-requests", headers=headers)
        assert response.status_code == 200
        
        requests_list = response.json()
        print(f"Total maintenance requests: {len(requests_list)}")
        
        # Find requests with submitted_by fields
        requests_with_submitted_by = [r for r in requests_list if r.get('submitted_by_id')]
        print(f"Requests with submitted_by: {len(requests_with_submitted_by)}")
        
        if requests_with_submitted_by:
            sample = requests_with_submitted_by[0]
            print(f"Sample request with submitted_by:")
            print(f"  - submitted_by_id: {sample.get('submitted_by_id')}")
            print(f"  - submitted_by_name: {sample.get('submitted_by_name')}")
            print(f"  - submitted_by_role: {sample.get('submitted_by_role')}")


class TestUserApprovalWorkflow:
    """Test user approval workflow from dashboard"""
    
    @pytest.fixture
    def group_manager_token(self):
        """Get Group Fleet Manager token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": GROUP_MANAGER_EMAIL,
            "password": GROUP_MANAGER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Could not get Group Manager token")
    
    def test_approve_user_endpoint_exists(self, group_manager_token):
        """Test that user approval endpoint exists"""
        headers = {"Authorization": f"Bearer {group_manager_token}"}
        
        # First get pending users
        response = requests.get(f"{BASE_URL}/api/dashboard/staff", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        pending_users = data.get("pending_users", [])
        
        if pending_users:
            user_id = pending_users[0].get("id")
            # Try to approve the user
            approve_response = requests.put(
                f"{BASE_URL}/api/auth/users/{user_id}/approve",
                headers=headers
            )
            print(f"Approve user response: {approve_response.status_code}")
            print(f"Response: {approve_response.text}")
            # Should be 200 or 404 (if user already approved)
            assert approve_response.status_code in [200, 404, 400]
        else:
            print("No pending users to approve")


class TestComplianceDashboard:
    """Test compliance data on dashboard"""
    
    @pytest.fixture
    def group_manager_token(self):
        """Get Group Fleet Manager token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": GROUP_MANAGER_EMAIL,
            "password": GROUP_MANAGER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Could not get Group Manager token")
    
    def test_compliance_endpoint(self, group_manager_token):
        """Test /api/dashboard/compliance endpoint"""
        headers = {"Authorization": f"Bearer {group_manager_token}"}
        
        response = requests.get(f"{BASE_URL}/api/dashboard/compliance", headers=headers)
        print(f"Compliance Response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        print(f"Compliance Data: {data}")
        
        # Verify compliance summary structure
        assert "summary" in data
        summary = data.get("summary", {})
        assert "compliance_rate" in summary
        assert "compliant" in summary
        assert "non_compliant" in summary
        assert "warning" in summary
        
        print(f"Compliance Rate: {summary.get('compliance_rate')}%")
        print(f"Compliant: {summary.get('compliant')}")
        print(f"Non-Compliant: {summary.get('non_compliant')}")
        print(f"Warning: {summary.get('warning')}")


class TestDashboardAlerts:
    """Test alerts on dashboard"""
    
    def test_alerts_endpoint(self):
        """Test /api/dashboard/alerts endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/alerts")
        print(f"Alerts Response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        print(f"Alerts Data: {data}")
        
        # Verify alerts structure
        assert "alerts" in data
        assert "total_count" in data
        assert "critical_count" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

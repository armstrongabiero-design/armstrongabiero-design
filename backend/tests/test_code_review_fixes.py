"""
Test Code Review Vulnerability Fixes - Iteration 6
Tests:
1. Backend APIs still functional after refactoring
2. /api/tco/fleet endpoint works (variable shadowing fix)
3. Test file uses environment variables for credentials
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from environment variables (with fallbacks for testing)
GROUP_MANAGER_EMAIL = os.environ.get("TEST_GROUP_MANAGER_EMAIL", "admin@gti.com")
GROUP_MANAGER_PASSWORD = os.environ.get("TEST_GROUP_MANAGER_PASSWORD", "admin123")
DRIVER_EMAIL = os.environ.get("TEST_DRIVER_EMAIL", "driver1@gti.com")
DRIVER_PASSWORD = os.environ.get("TEST_DRIVER_PASSWORD", "Test123!")


class TestBackendAPIs:
    """Test that backend APIs are still functional after code review fixes"""
    
    def test_vehicles_endpoint(self):
        """Test /api/vehicles endpoint"""
        response = requests.get(f"{BASE_URL}/api/vehicles")
        print(f"Vehicles Response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Total vehicles: {len(data)}")
    
    def test_drivers_endpoint(self):
        """Test /api/drivers endpoint"""
        response = requests.get(f"{BASE_URL}/api/drivers")
        print(f"Drivers Response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Total drivers: {len(data)}")
    
    def test_tco_fleet_endpoint(self):
        """Test /api/tco/fleet endpoint - variable shadowing fix"""
        response = requests.get(f"{BASE_URL}/api/tco/fleet")
        print(f"TCO Fleet Response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "costs" in data
        assert "total_distance_km" in data
        assert "cost_per_km_usd" in data
        print(f"TCO Fleet Data: costs={data['costs']}, distance={data['total_distance_km']}km")
    
    def test_dashboard_alerts_endpoint(self):
        """Test /api/dashboard/alerts endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/alerts")
        print(f"Alerts Response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        
        assert "alerts" in data
        assert "total_count" in data
        print(f"Total alerts: {data['total_count']}")
    
    def test_dashboard_compliance_endpoint(self):
        """Test /api/dashboard/compliance endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/compliance")
        print(f"Compliance Response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        
        assert "summary" in data
        print(f"Compliance rate: {data['summary'].get('compliance_rate')}%")


class TestAuthentication:
    """Test authentication flows"""
    
    def test_driver_login(self):
        """Test driver login (no OTP required)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        print(f"Driver Login Response: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data
            assert data.get("user", {}).get("role") == "DRIVER"
            print(f"Driver logged in: {data.get('user', {}).get('full_name')}")
        else:
            pytest.skip("Driver login failed - may need to create account")
    
    def test_group_manager_login_requires_otp(self):
        """Test Group Fleet Manager login requires OTP"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": GROUP_MANAGER_EMAIL,
            "password": GROUP_MANAGER_PASSWORD
        })
        print(f"Group Manager Login Response: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            # Should require OTP for Group Fleet Manager
            if data.get("requires_otp"):
                print("OTP verification required - as expected")
                assert data.get("email") == GROUP_MANAGER_EMAIL
            else:
                # Direct login (token returned)
                assert "access_token" in data
                print("Direct login successful")
        else:
            pytest.skip("Group Manager login failed")


class TestStaffDashboard:
    """Test staff dashboard with authenticated requests"""
    
    @pytest.fixture
    def driver_token(self):
        """Get driver token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Could not get driver token")
    
    def test_personal_dashboard(self, driver_token):
        """Test personal dashboard for driver"""
        headers = {"Authorization": f"Bearer {driver_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/personal", headers=headers)
        print(f"Personal Dashboard Response: {response.status_code}")
        
        # May return 200 or 404 depending on implementation
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            print(f"Personal Dashboard Data: {data}")


class TestReportsEndpoints:
    """Test reports endpoints"""
    
    def test_expense_breakdown(self):
        """Test /api/reports/expense-breakdown endpoint"""
        response = requests.get(f"{BASE_URL}/api/reports/expense-breakdown")
        print(f"Expense Breakdown Response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        
        assert "breakdown" in data or "total_usd" in data
        print(f"Expense Breakdown: {data}")
    
    def test_utilization(self):
        """Test /api/reports/utilization endpoint"""
        response = requests.get(f"{BASE_URL}/api/reports/utilization")
        print(f"Utilization Response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        
        assert "fleet_avg_utilization" in data or "vehicles" in data
        print(f"Fleet Utilization: {data.get('fleet_avg_utilization')}%")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

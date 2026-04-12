import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any

class FleetManagementAPITester:
    def __init__(self, base_url="https://gti-fleet-solutions.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_entities = {}  # Store created entities for cleanup and reference

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, data: Dict = None, headers: Dict = None) -> tuple:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_api_root(self):
        """Test API root endpoint"""
        return self.run_test("API Root", "GET", "", 200)

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        return self.run_test("Dashboard Stats", "GET", "dashboard/stats", 200)

    def test_exchange_rates(self):
        """Test exchange rates endpoint"""
        return self.run_test("Current Exchange Rates", "GET", "exchange-rates/current", 200)

    def test_country_operations(self):
        """Test country CRUD operations"""
        print("\n=== TESTING COUNTRY OPERATIONS ===")
        
        # Create country
        country_data = {
            "name": "GHANA",
            "currency": "GHS",
            "tax_id_label": "TIN",
            "regulatory_body": "DVLA Ghana"
        }
        success, response = self.run_test("Create Country", "POST", "countries", 200, country_data)
        if success:
            self.created_entities['country'] = response
        
        # Get countries
        self.run_test("Get Countries", "GET", "countries", 200)
        
        # Get specific country
        if success:
            self.run_test("Get Specific Country", "GET", "countries/GHANA", 200)

    def test_vehicle_operations(self):
        """Test vehicle CRUD operations"""
        print("\n=== TESTING VEHICLE OPERATIONS ===")
        
        # Create vehicle
        vehicle_data = {
            "country": "GHANA",
            "registration_number": "GR-1234-20",
            "make": "Toyota",
            "model": "Hilux",
            "year": 2020,
            "vin": "1HGBH41JXMN109186",
            "status": "ACTIVE",
            "odometer_reading": 15000.0,
            "acquisition_date": "2020-01-15T00:00:00Z",
            "acquisition_cost": 45000.0,
            "acquisition_currency": "GHS",
            "country_specific_fields": {"insurance_number": "INS-123456"}
        }
        success, response = self.run_test("Create Vehicle", "POST", "vehicles", 200, vehicle_data)
        if success:
            self.created_entities['vehicle'] = response
            vehicle_id = response.get('id')
            
            # Test vehicle retrieval
            self.run_test("Get Vehicles", "GET", "vehicles", 200)
            self.run_test("Get Vehicle by ID", "GET", f"vehicles/{vehicle_id}", 200)
            
            # Test vehicle update
            update_data = {"odometer_reading": 16000.0}
            self.run_test("Update Vehicle", "PUT", f"vehicles/{vehicle_id}", 200, update_data)

    def test_driver_operations(self):
        """Test driver CRUD operations"""
        print("\n=== TESTING DRIVER OPERATIONS ===")
        
        # Create driver
        driver_data = {
            "country": "GHANA",
            "first_name": "John",
            "last_name": "Doe",
            "license_number": "DL-123456",
            "license_expiry": "2025-12-31T00:00:00Z",
            "phone": "+233123456789",
            "email": "john.doe@example.com"
        }
        success, response = self.run_test("Create Driver", "POST", "drivers", 200, driver_data)
        if success:
            self.created_entities['driver'] = response
            driver_id = response.get('id')
            
            # Test driver retrieval
            self.run_test("Get Drivers", "GET", "drivers", 200)
            self.run_test("Get Driver by ID", "GET", f"drivers/{driver_id}", 200)

    def test_maintenance_operations(self):
        """Test maintenance operations including AI prediction"""
        print("\n=== TESTING MAINTENANCE OPERATIONS ===")
        
        vehicle_id = self.created_entities.get('vehicle', {}).get('id')
        if not vehicle_id:
            print("❌ Skipping maintenance tests - no vehicle created")
            return
        
        # Create maintenance record
        maintenance_data = {
            "vehicle_id": vehicle_id,
            "maintenance_type": "SCHEDULED",
            "description": "Oil change and filter replacement",
            "scheduled_date": "2024-02-15T10:00:00Z",
            "odometer_at_maintenance": 15500.0,
            "cost": 250.0,
            "currency": "GHS",
            "notes": "Regular maintenance"
        }
        success, response = self.run_test("Create Maintenance Record", "POST", "maintenance", 200, maintenance_data)
        if success:
            self.created_entities['maintenance'] = response
        
        # Get maintenance records
        self.run_test("Get Maintenance Records", "GET", "maintenance", 200)
        
        # Test AI maintenance prediction
        self.run_test("AI Maintenance Prediction", "POST", f"maintenance/predict/{vehicle_id}", 200)

    def test_inventory_operations(self):
        """Test inventory operations"""
        print("\n=== TESTING INVENTORY OPERATIONS ===")
        
        # Create inventory item
        item_data = {
            "name": "Engine Oil 5W-30",
            "sku": "OIL-5W30-001",
            "category": "Lubricants",
            "country": "GHANA",
            "location": "Warehouse A",
            "quantity": 50,
            "reorder_level": 10,
            "unit_cost": 25.0,
            "currency": "GHS",
            "lead_time_days": 7
        }
        success, response = self.run_test("Create Inventory Item", "POST", "inventory", 200, item_data)
        if success:
            self.created_entities['inventory_item'] = response
            item_id = response.get('id')
            
            # Get inventory items
            self.run_test("Get Inventory Items", "GET", "inventory", 200)
            
            # Create inventory transaction
            transaction_data = {
                "item_id": item_id,
                "transaction_type": "USAGE",
                "quantity": 5,
                "reference": "Maintenance Job #123",
                "notes": "Used for vehicle maintenance"
            }
            self.run_test("Create Inventory Transaction", "POST", "inventory/transactions", 200, transaction_data)
            
            # Get inventory transactions
            self.run_test("Get Inventory Transactions", "GET", "inventory/transactions", 200)

    def test_fuel_operations(self):
        """Test fuel operations including anomaly detection"""
        print("\n=== TESTING FUEL OPERATIONS ===")
        
        vehicle_id = self.created_entities.get('vehicle', {}).get('id')
        driver_id = self.created_entities.get('driver', {}).get('id')
        
        if not vehicle_id or not driver_id:
            print("❌ Skipping fuel tests - missing vehicle or driver")
            return
        
        # Create fuel transaction
        fuel_data = {
            "vehicle_id": vehicle_id,
            "driver_id": driver_id,
            "date": "2024-02-10T08:00:00Z",
            "quantity_liters": 45.0,
            "cost": 300.0,
            "currency": "GHS",
            "odometer_reading": 15200.0,
            "location": "Shell Station, Accra"
        }
        success, response = self.run_test("Create Fuel Transaction", "POST", "fuel", 200, fuel_data)
        if success:
            self.created_entities['fuel_transaction'] = response
        
        # Get fuel transactions
        self.run_test("Get Fuel Transactions", "GET", "fuel", 200)

    def test_expenditure_operations(self):
        """Test expenditure operations"""
        print("\n=== TESTING EXPENDITURE OPERATIONS ===")
        
        vehicle_id = self.created_entities.get('vehicle', {}).get('id')
        
        # Create expenditure
        expenditure_data = {
            "country": "GHANA",
            "category": "Maintenance",
            "description": "Brake pad replacement",
            "amount": 180.0,
            "currency": "GHS",
            "date": "2024-02-12T00:00:00Z",
            "vehicle_id": vehicle_id
        }
        success, response = self.run_test("Create Expenditure", "POST", "expenditures", 200, expenditure_data)
        if success:
            self.created_entities['expenditure'] = response
        
        # Get expenditures
        self.run_test("Get Expenditures", "GET", "expenditures", 200)

    def test_document_operations(self):
        """Test document operations"""
        print("\n=== TESTING DOCUMENT OPERATIONS ===")
        
        vehicle_id = self.created_entities.get('vehicle', {}).get('id')
        if not vehicle_id:
            print("❌ Skipping document tests - no vehicle created")
            return
        
        # Create document
        document_data = {
            "country": "GHANA",
            "document_type": "ROADWORTHY_CERT",
            "entity_id": vehicle_id,
            "entity_type": "VEHICLE",
            "document_number": "RW-2024-001234",
            "issue_date": "2024-01-01T00:00:00Z",
            "expiry_date": "2024-12-31T00:00:00Z",
            "file_url": "https://example.com/documents/roadworthy.pdf"
        }
        success, response = self.run_test("Create Document", "POST", "documents", 200, document_data)
        if success:
            self.created_entities['document'] = response
        
        # Get documents
        self.run_test("Get Documents", "GET", "documents", 200)

    def test_asset_operations(self):
        """Test asset operations including AI resale prediction"""
        print("\n=== TESTING ASSET OPERATIONS ===")
        
        vehicle_id = self.created_entities.get('vehicle', {}).get('id')
        if not vehicle_id:
            print("❌ Skipping asset tests - no vehicle created")
            return
        
        # Create asset
        asset_data = {
            "vehicle_id": vehicle_id,
            "acquisition_date": "2020-01-15T00:00:00Z",
            "acquisition_cost": 45000.0,
            "currency": "GHS",
            "depreciation_rate": 0.15
        }
        success, response = self.run_test("Create Asset", "POST", "assets", 200, asset_data)
        if success:
            self.created_entities['asset'] = response
            asset_id = response.get('id')
            
            # Get assets
            self.run_test("Get Assets", "GET", "assets", 200)
            
            # Test AI resale prediction
            self.run_test("AI Resale Prediction", "POST", f"assets/{asset_id}/predict-resale", 200)

    def test_safety_operations(self):
        """Test safety operations"""
        print("\n=== TESTING SAFETY OPERATIONS ===")
        
        vehicle_id = self.created_entities.get('vehicle', {}).get('id')
        driver_id = self.created_entities.get('driver', {}).get('id')
        
        if not vehicle_id or not driver_id:
            print("❌ Skipping safety tests - missing vehicle or driver")
            return
        
        # Create safety incident
        incident_data = {
            "driver_id": driver_id,
            "vehicle_id": vehicle_id,
            "incident_date": "2024-02-08T14:30:00Z",
            "incident_type": "Minor Collision",
            "severity": "LOW",
            "description": "Minor fender bender in parking lot",
            "location": "Accra Mall Parking",
            "cost": 500.0,
            "currency": "GHS"
        }
        success, response = self.run_test("Create Safety Incident", "POST", "safety/incidents", 200, incident_data)
        if success:
            self.created_entities['safety_incident'] = response
        
        # Get safety incidents
        self.run_test("Get Safety Incidents", "GET", "safety/incidents", 200)

    def test_workshop_operations(self):
        """Test workshop operations"""
        print("\n=== TESTING WORKSHOP OPERATIONS ===")
        
        vehicle_id = self.created_entities.get('vehicle', {}).get('id')
        if not vehicle_id:
            print("❌ Skipping workshop tests - no vehicle created")
            return
        
        # Create workshop job
        workshop_data = {
            "vehicle_id": vehicle_id,
            "workshop_type": "EXTERNAL",
            "workshop_name": "Accra Auto Repair",
            "description": "Engine diagnostic and repair",
            "start_date": "2024-02-20T08:00:00Z",
            "estimated_completion": "2024-02-22T17:00:00Z",
            "cost": 800.0,
            "currency": "GHS"
        }
        success, response = self.run_test("Create Workshop Job", "POST", "workshops", 200, workshop_data)
        if success:
            self.created_entities['workshop_job'] = response
        
        # Get workshop jobs
        self.run_test("Get Workshop Jobs", "GET", "workshops", 200)

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Fleet Management System API Tests")
        print(f"Base URL: {self.base_url}")
        
        # Basic API tests
        self.test_api_root()
        self.test_dashboard_stats()
        self.test_exchange_rates()
        
        # Core entity tests
        self.test_country_operations()
        self.test_vehicle_operations()
        self.test_driver_operations()
        
        # Feature tests
        self.test_maintenance_operations()
        self.test_inventory_operations()
        self.test_fuel_operations()
        self.test_expenditure_operations()
        self.test_document_operations()
        self.test_asset_operations()
        self.test_safety_operations()
        self.test_workshop_operations()
        
        # Print final results
        print(f"\n📊 FINAL RESULTS")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = FleetManagementAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
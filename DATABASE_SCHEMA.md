# Fleet Management System - Database Schema

## Overview
This document outlines the complete MongoDB database schema for the Fleet Management System designed for multi-country operations across **Ghana, Liberia, and São Tomé and Príncipe**.

## Collections

### 1. **countries**
Stores country-specific configurations and regulatory information.

```json
{
  "id": "uuid",
  "name": "GHANA | LIBERIA | SAO_TOME",
  "currency": "GHS | LRD | USD | STN",
  "date_format": "DD/MM/YYYY",
  "tax_id_label": "TIN | Tax ID | etc.",
  "regulatory_body": "DVLA Ghana | MOT Liberia | DTT São Tomé",
  "created_at": "ISO datetime"
}
```

### 2. **vehicles**
Master vehicle data with country-specific fields support.

```json
{
  "id": "uuid",
  "country": "GHANA | LIBERIA | SAO_TOME",
  "registration_number": "string",
  "make": "string",
  "model": "string",
  "year": "integer",
  "vin": "string",
  "status": "ACTIVE | MAINTENANCE | INACTIVE | DISPOSED",
  "odometer_reading": "float",
  "acquisition_date": "ISO datetime",
  "acquisition_cost": "float",
  "acquisition_currency": "GHS | LRD | USD | STN",
  "acquisition_cost_usd": "float (auto-calculated)",
  "country_specific_fields": {
    "tax_id": "string",
    "permit_number": "string",
    "customs_clearance": "string"
  },
  "created_at": "ISO datetime",
  "updated_at": "ISO datetime"
}
```

### 3. **drivers**
Driver profiles with safety scoring and licensing information.

```json
{
  "id": "uuid",
  "country": "GHANA | LIBERIA | SAO_TOME",
  "first_name": "string",
  "last_name": "string",
  "license_number": "string",
  "license_expiry": "ISO datetime",
  "phone": "string",
  "email": "string (optional)",
  "safety_score": "float (0-100, default: 100)",
  "total_incidents": "integer (default: 0)",
  "status": "ACTIVE | INACTIVE | SUSPENDED",
  "created_at": "ISO datetime",
  "updated_at": "ISO datetime"
}
```

### 4. **maintenance_records**
Maintenance history with AI-driven predictive maintenance support.

```json
{
  "id": "uuid",
  "vehicle_id": "uuid (FK to vehicles)",
  "maintenance_type": "SCHEDULED | UNSCHEDULED | PREDICTIVE",
  "description": "string",
  "scheduled_date": "ISO datetime",
  "completed_date": "ISO datetime (nullable)",
  "odometer_at_maintenance": "float",
  "cost": "float",
  "currency": "GHS | LRD | USD | STN",
  "cost_usd": "float (auto-calculated)",
  "workshop_id": "uuid (FK to workshop_jobs, optional)",
  "parts_used": ["string"],
  "notes": "string (optional)",
  "ai_predicted": "boolean (default: false)",
  "harshness_score": "float (nullable)",
  "created_at": "ISO datetime"
}
```

### 5. **workshop_jobs**
Internal and external workshop repair tracking.

```json
{
  "id": "uuid",
  "vehicle_id": "uuid (FK to vehicles)",
  "workshop_type": "INTERNAL | EXTERNAL",
  "workshop_name": "string",
  "description": "string",
  "start_date": "ISO datetime",
  "estimated_completion": "ISO datetime",
  "actual_completion": "ISO datetime (nullable)",
  "cost": "float",
  "currency": "GHS | LRD | USD | STN",
  "cost_usd": "float (auto-calculated)",
  "status": "IN_PROGRESS | COMPLETED | CANCELLED",
  "created_at": "ISO datetime"
}
```

### 6. **inventory_items**
Multi-location inventory with lead time tracking.

```json
{
  "id": "uuid",
  "name": "string",
  "sku": "string (unique)",
  "category": "string",
  "country": "GHANA | LIBERIA | SAO_TOME",
  "location": "string (warehouse/depot name)",
  "quantity": "integer (default: 0)",
  "reorder_level": "integer (default: 10)",
  "unit_cost": "float",
  "currency": "GHS | LRD | USD | STN",
  "unit_cost_usd": "float (auto-calculated)",
  "lead_time_days": "integer (longer for STP and Liberia)",
  "created_at": "ISO datetime",
  "updated_at": "ISO datetime"
}
```

### 7. **inventory_transactions**
Stock movement history across locations.

```json
{
  "id": "uuid",
  "item_id": "uuid (FK to inventory_items)",
  "transaction_type": "PURCHASE | USAGE | TRANSFER | ADJUSTMENT",
  "quantity": "integer",
  "from_location": "string (optional)",
  "to_location": "string (optional)",
  "reference": "string (optional, e.g., PO number)",
  "notes": "string (optional)",
  "created_at": "ISO datetime"
}
```

### 8. **fuel_transactions**
Fuel purchases with efficiency tracking and AI anomaly detection.

```json
{
  "id": "uuid",
  "vehicle_id": "uuid (FK to vehicles)",
  "driver_id": "uuid (FK to drivers)",
  "date": "ISO datetime",
  "quantity_liters": "float",
  "cost": "float",
  "currency": "GHS | LRD | USD | STN",
  "cost_usd": "float (auto-calculated)",
  "odometer_reading": "float",
  "fuel_efficiency": "float (km/L, calculated)",
  "location": "string",
  "anomaly_detected": "boolean (default: false)",
  "anomaly_reason": "string (nullable)",
  "created_at": "ISO datetime"
}
```

### 9. **expenditures**
All fleet expenses with multi-currency and USD reporting.

```json
{
  "id": "uuid",
  "country": "GHANA | LIBERIA | SAO_TOME",
  "category": "string (Repairs, Tolls, Parking, etc.)",
  "description": "string",
  "amount": "float",
  "currency": "GHS | LRD | USD | STN",
  "amount_usd": "float (auto-calculated)",
  "date": "ISO datetime",
  "vehicle_id": "uuid (FK to vehicles, optional)",
  "driver_id": "uuid (FK to drivers, optional)",
  "receipt_url": "string (optional)",
  "approved": "boolean (default: false)",
  "created_at": "ISO datetime"
}
```

### 10. **documents**
Compliance documents with AI OCR support.

```json
{
  "id": "uuid",
  "country": "GHANA | LIBERIA | SAO_TOME",
  "document_type": "ROADWORTHY_CERT | INSURANCE | DRIVER_LICENSE | VEHICLE_REGISTRATION | OTHER",
  "entity_id": "uuid (vehicle_id or driver_id)",
  "entity_type": "VEHICLE | DRIVER",
  "document_number": "string",
  "issue_date": "ISO datetime",
  "expiry_date": "ISO datetime",
  "file_url": "string",
  "ocr_processed": "boolean (default: false)",
  "ocr_data": {
    "document_number": "string",
    "issue_date": "string",
    "expiry_date": "string",
    "holder_name": "string",
    "issuing_authority": "string",
    "additional_fields": {},
    "validation_status": "VALID | EXPIRED | INVALID"
  },
  "validated": "boolean (default: false)",
  "validation_notes": "string (optional)",
  "created_at": "ISO datetime"
}
```

### 11. **assets**
Asset lifecycle tracking with depreciation and AI resale forecasting.

```json
{
  "id": "uuid",
  "vehicle_id": "uuid (FK to vehicles)",
  "acquisition_date": "ISO datetime",
  "acquisition_cost": "float",
  "currency": "GHS | LRD | USD | STN",
  "acquisition_cost_usd": "float (auto-calculated)",
  "current_value": "float",
  "current_value_usd": "float",
  "depreciation_rate": "float (default: 0.15, i.e., 15% per year)",
  "disposal_date": "ISO datetime (nullable)",
  "disposal_value": "float (nullable)",
  "predicted_resale_value": "float (AI-generated, nullable)",
  "created_at": "ISO datetime",
  "updated_at": "ISO datetime"
}
```

### 12. **safety_incidents**
Driver safety incidents with automatic safety score updates.

```json
{
  "id": "uuid",
  "driver_id": "uuid (FK to drivers)",
  "vehicle_id": "uuid (FK to vehicles)",
  "incident_date": "ISO datetime",
  "incident_type": "string (Collision, Speeding, etc.)",
  "severity": "LOW | MEDIUM | HIGH",
  "description": "string",
  "location": "string",
  "cost": "float (optional)",
  "currency": "GHS | LRD | USD | STN (optional)",
  "cost_usd": "float (auto-calculated, nullable)",
  "created_at": "ISO datetime"
}
```

### 13. **exchange_rates**
Historical currency conversion rates (auto-fetched via forex-python).

```json
{
  "id": "uuid",
  "from_currency": "GHS | LRD | STN",
  "to_currency": "USD",
  "rate": "float",
  "date": "ISO datetime"
}
```

### 14. **ai_predictions**
Store AI analysis results for auditing and improvement.

```json
{
  "id": "uuid",
  "prediction_type": "MAINTENANCE | FUEL_ANOMALY | RESALE_VALUE",
  "entity_id": "uuid (vehicle_id, asset_id, etc.)",
  "entity_type": "VEHICLE | ASSET | FUEL_TRANSACTION",
  "prediction_data": {
    "predicted_issues": ["string"],
    "priority": "HIGH | MEDIUM | LOW",
    "estimated_cost_usd": "float",
    "confidence": "float"
  },
  "confidence_score": "float (0-1)",
  "created_at": "ISO datetime"
}
```

## Key Features

### Multi-Currency Support
- All financial transactions stored in local currency (GHS, LRD, USD, STN)
- Automatic conversion to USD for unified reporting
- Live exchange rates fetched via `forex-python` library
- Historical rates stored for accurate reporting

### Country-Specific Fields
Vehicles can have custom fields per country:
- **Ghana**: DVLA number, road fund sticker
- **Liberia**: MOT certificate, customs clearance
- **São Tomé**: DTT registration, import permits

### AI Integration Points
1. **Predictive Maintenance** (OpenAI GPT-5.2)
   - Analyzes harshness of use, odometer, maintenance history
   - Predicts upcoming issues and costs

2. **OCR Document Scanning** (OpenAI Vision)
   - Extracts data from certificates, licenses, insurance
   - Validates expiry dates and document authenticity

3. **Fuel Anomaly Detection** (OpenAI GPT-5.2)
   - Detects theft, overcharging, inefficiency
   - Flags suspicious transactions

4. **Resale Value Forecasting** (OpenAI GPT-5.2)
   - Predicts market value based on age, condition, market
   - Suggests optimal disposal timing

## API Directory Structure

```
/api/
├── /countries              # Country management
├── /vehicles               # Vehicle CRUD + filters
├── /drivers                # Driver management + safety scoring
├── /maintenance            # Maintenance records + AI predictions
├── /workshops              # Workshop job management
├── /inventory              # Inventory items + transactions
├── /fuel                   # Fuel tracking + anomaly detection
├── /expenditures           # Expense tracking
├── /documents              # Document management + OCR
├── /assets                 # Asset lifecycle + resale predictions
├── /safety/incidents       # Safety incident reporting
├── /exchange-rates         # Live and historical rates
└── /dashboard/stats        # Aggregate statistics
```

## Indexes (Recommended)

For optimal query performance, create these MongoDB indexes:

```javascript
// Vehicles
db.vehicles.createIndex({ "country": 1, "status": 1 })
db.vehicles.createIndex({ "registration_number": 1 })

// Drivers
db.drivers.createIndex({ "country": 1, "status": 1 })
db.drivers.createIndex({ "license_number": 1 })

// Maintenance
db.maintenance_records.createIndex({ "vehicle_id": 1, "scheduled_date": -1 })

// Fuel
db.fuel_transactions.createIndex({ "vehicle_id": 1, "date": -1 })
db.fuel_transactions.createIndex({ "anomaly_detected": 1 })

// Documents
db.documents.createIndex({ "entity_id": 1, "expiry_date": 1 })

// Safety
db.safety_incidents.createIndex({ "driver_id": 1, "incident_date": -1 })
```

## Currency Conversion Logic

All currency conversions follow this pattern:
```python
from currency_utils import currency_converter

# Convert local currency to USD
amount_usd = currency_converter.convert(
    amount=local_amount,
    from_currency=local_currency,
    to_currency="USD"
)
```

Fallback rates (if API fails):
- GHS to USD: 1 GHS = 0.065 USD
- LRD to USD: 1 LRD = 0.0053 USD
- STN to USD: 1 STN = 0.041 USD

## Data Integrity Rules

1. **No ObjectId in Responses**: All MongoDB `_id` fields excluded from API responses
2. **DateTime Serialization**: All dates stored as ISO strings in MongoDB
3. **Currency Validation**: Only GHS, LRD, USD, STN accepted
4. **Country Validation**: Only GHANA, LIBERIA, SAO_TOME accepted
5. **Safety Score**: Automatically updated on incident creation (penalties: LOW=-2, MEDIUM=-5, HIGH=-10)
6. **Inventory Quantities**: Cannot go negative
7. **Document Expiry**: System flags expired documents

## Notes

- All IDs are UUIDs (not MongoDB ObjectIds)
- Timestamps in UTC
- API enforces `/api` prefix for all routes
- CORS enabled for all origins (configurable)

# Fleet Management System (FleetHub) - Product Requirements Document

## Overview
AI-native Fleet Management System designed for operations in Ghana, Liberia, and São Tomé and Príncipe (STP).

## Tech Stack
- **Backend:** FastAPI (Python)
- **Frontend:** React (responsive web app)
- **Database:** MongoDB
- **AI/ML:** OpenAI GPT-5.2 (Predictive Maintenance), OpenAI Vision (OCR)
- **Integrations:** Emergent LLM Key, forex-python for currency conversion

## Core Modules (All Implemented ✅)

### 1. Maintenance & Workshop
- Schedule and track maintenance records
- AI-powered predictive maintenance analysis
- Workshop management

### 2. Stores & Inventory
- Multi-country inventory tracking
- Transaction management (purchase, usage, transfer, adjustment)
- Low-stock alerts

### 3. Fuel & Expenditure
- Fuel transaction logging
- AI-powered anomaly detection for fraud prevention
- Multi-currency expense tracking with USD conversion

### 4. Compliance & Documents
- Document management for vehicles and drivers
- Support for local document types (Roadworthy Cert, Insurance, Driver License, Registration)
- AI OCR integration (placeholder ready)

### 5. Asset Lifecycle
- Track vehicle acquisition and depreciation
- AI-driven resale value forecasting
- Current value calculation

### 6. Driver Management
- Driver profile management
- Safety scoring system
- Incident tracking with automatic score updates

## Multi-Currency Support
- Local currencies: GHS (Ghana), LRD (Liberia), STN (São Tomé), USD
- All transactions stored in local currency
- Automatic conversion to unified USD for reporting
- Live exchange rate fetching

## Completed Work (December 2025)

### Session 1
- [x] Database schema design for all 6 modules
- [x] Backend API implementation (FastAPI)
- [x] Frontend UI (React + Shadcn/UI)
- [x] AI integrations (GPT-5.2 + Vision via Emergent LLM Key)
- [x] Multi-currency conversion
- [x] Demo data population (6 vehicles, 5 drivers)
- [x] Testing (96% pass rate)
- [x] User demo completed

### Session 2
- [x] Fixed accessibility issues (DialogDescription added to all modals)
- [x] Deployment readiness check passed

## Key API Endpoints
- `/api/` - API health check
- `/api/dashboard/stats` - Dashboard statistics
- `/api/vehicles/` - Vehicle CRUD
- `/api/drivers/` - Driver CRUD
- `/api/maintenance/` - Maintenance records
- `/api/maintenance/predict/{vehicle_id}` - AI maintenance prediction
- `/api/inventory/` - Inventory items
- `/api/inventory/transactions` - Inventory transactions
- `/api/fuel/` - Fuel transactions
- `/api/expenditures/` - Expenditure records
- `/api/documents/` - Document management
- `/api/assets/` - Asset lifecycle
- `/api/assets/{asset_id}/predict-resale` - AI resale prediction
- `/api/safety/incidents` - Safety incidents
- `/api/exchange-rates/current` - Live exchange rates

## Database Collections
- `countries` - Country configuration
- `vehicles` - Fleet vehicles
- `drivers` - Driver profiles
- `maintenance` - Maintenance records
- `workshops` - Workshop details
- `inventory_items` - Inventory stock
- `inventory_transactions` - Stock transactions
- `fuel_transactions` - Fuel entries
- `expenditures` - General expenses
- `documents` - Compliance documents
- `assets` - Vehicle assets
- `safety_incidents` - Safety records

## Deployment Status
- **Preview URL:** https://easyfleet.preview.emergentagent.com
- **Deployment Ready:** ✅ PASS
- **No blockers detected**

## Upcoming Tasks (P0)
1. Deploy to production
2. Thoroughly test AI features with real data:
   - OCR document scanning
   - Fuel anomaly detection
   - Resale value prediction

## Future/Backlog Tasks (P1)
1. Real-time GPS tracking for vehicles
2. Email/SMS notifications for maintenance reminders and low-stock alerts
3. Advanced analytics dashboard with charts and historical trends
4. PDF report generation
5. Multi-user roles and permissions (Admin, Manager, Driver)
6. User documentation and API guides

## Files Reference
- Backend: `/app/backend/server.py`, `/app/backend/models.py`
- Frontend: `/app/frontend/src/pages/`, `/app/frontend/src/components/`
- Scripts: `/app/scripts/populate_db.py`
- Schema Docs: `/app/DATABASE_SCHEMA.md`

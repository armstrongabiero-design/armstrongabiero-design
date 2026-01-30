# GTI Fleet Solutions - Product Requirements Document

## Overview
AI-native Fleet Management System designed for GTI operations in Ghana, Liberia, and São Tomé and Príncipe (STP).

## Brand
- **Name:** GTI Fleet Solutions
- **Tagline:** Multi-Country Fleet Management
- **Operations:** Ghana 🇬🇭 • Liberia 🇱🇷 • São Tomé 🇸🇹

## Tech Stack
- **Backend:** FastAPI (Python)
- **Frontend:** React (responsive web app)
- **Database:** MongoDB
- **AI/ML:** OpenAI GPT-5.2 (Predictive Maintenance), OpenAI Vision (OCR)
- **Authentication:** JWT-based role authentication
- **Email:** SendGrid (configured, needs API key)

## User Roles & Access Control
| Role | Access Level | Approval |
|------|-------------|----------|
| Group Fleet Manager | All countries, all features, user management | Auto-approved |
| Country Fleet Manager | Own country only | Requires Group Manager approval |
| Driver | Own trips/checklists | Requires Group Manager approval |

## Core Modules (All Implemented ✅)

### 1. Authentication & User Management
- Role-based login (email/password)
- User registration with approval workflow
- Group Fleet Manager controls all user access
- Session management with JWT tokens
- **Forgot Password / Reset Password** - Email-based password recovery (Dec 2025)
- **Password Visibility Toggle** - Show/hide password for all password fields (Dec 2025)
- **Confirm Password** - Registration form now requires password confirmation (Dec 2025)

### 2. Dashboard with Alerts
- Fleet statistics by country
- Compliance status indicators (Compliant/Warning/Non-Compliant)
- Active alerts: Document expiry, fuel anomalies, speeding, low stock
- Multi-country filter for Group Manager

### 3. Vehicle Management
- Vehicle registration across 3 countries
- Status tracking (Active/Maintenance/Inactive)
- Location tracking (GPS + Manual backup)

### 4. Driver Management
- Driver profiles by country
- Safety scoring system
- License and document tracking

### 5. Maintenance & Requests
- Maintenance records with AI predictions
- **Authorization Workflow:**
  - Driver/Fleet Officer submits request
  - Fleet Manager receives notification
  - Manager approves or rejects (with reason)
  - Driver notified of decision

### 6. Pre-Trip Checklist
- Daily vehicle inspection before trips
- 7 checkpoint items with OK/Needs Attention/Failed status
- Photo upload for damage documentation
- **Blocks fuel/trip logging until completed**

### 7. Tire Management
- Serial number tracking per tire
- Position tracking (FL/FR/RL/RR/Spare)
- Tread depth monitoring with alerts
- Rotation scheduling (90-day intervals)

### 8. Driver Digital Logbook
- Trip recording (start/end location, odometer)
- Driving metrics (speed, violations, harsh events)
- 30-day driver summary reports

### 9. Inventory Management
- Parts and supplies tracking
- Low stock alerts
- Transaction history

### 10. Fuel Management
- Fuel transaction logging
- Anomaly detection
- Cost tracking in local currency + USD

### 11. Vendor Management
- Supplier registration by category
- Preferred vendor marking
- Contact and payment terms

### 12. Documents & Compliance
- Document management (Roadworthy, Insurance, License, Registration)
- Expiry tracking with alerts
- Compliance rate calculation

### 13. Assets & TCO
- Asset lifecycle tracking
- Depreciation calculation
- AI resale value prediction
- **Total Cost of Ownership:**
  - Cost per km calculation
  - Expense breakdown by category
  - Utilization reports

### 14. Fleet Map
- Vehicle location visualization
- Multi-country view
- Manual location updates (GPS backup)

### 15. Reports & Analytics
- Fleet TCO analysis
- Expense breakdown charts
- Vehicle utilization rates

## Multi-Currency Support
- Local currencies: GHS (Ghana), LRD (Liberia), STN (São Tomé), USD
- **Dashboard shows maintenance cost in GHS** (as requested)
- All transactions stored in local currency
- Automatic conversion to USD for reporting
- Live exchange rate: 1 USD = 15.5 GHS

## Key API Endpoints
- `/api/auth/*` - Authentication
- `/api/dashboard/*` - Stats, alerts, compliance
- `/api/vehicles/` - Vehicle CRUD
- `/api/drivers/` - Driver CRUD
- `/api/maintenance-requests/` - Request workflow
- `/api/pre-trip-checklists/` - Daily inspections
- `/api/tires/` - Tire management
- `/api/logbook/` - Driver trips
- `/api/vendors/` - Supplier management
- `/api/vehicle-locations/` - GPS/Manual locations
- `/api/tco/*` - Cost analysis
- `/api/reports/*` - Analytics

## Test Credentials
- **Email:** admin@gti.com
- **Password:** admin123
- **Role:** Group Fleet Manager

## Pending Configuration
- **SendGrid API Key** - For email notifications
  - Get free key at: https://sendgrid.com
  - Add to `/app/backend/.env` as `SENDGRID_API_KEY=your_key`

## Future/Backlog Tasks
- [ ] Offline Mode (PWA with sync)
- [ ] Native Mobile App (separate project)
- [ ] GPS device integration
- [ ] Advanced analytics charts
- [ ] PDF report export

## Files Reference
- Backend: `/app/backend/server.py`, `/app/backend/models.py`
- Auth: `/app/backend/auth_service.py`
- Email: `/app/backend/email_service.py`
- Frontend: `/app/frontend/src/pages/`
- Auth Context: `/app/frontend/src/contexts/AuthContext.js`

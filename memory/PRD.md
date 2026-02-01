# GTI Fleet Solutions - Product Requirements Document

## Overview
AI-native Fleet Management System designed for GTI operations globally (with focus on Ghana, Liberia, and São Tomé and Príncipe).

## Brand
- **Name:** GTI Fleet Solutions
- **Tagline:** Multi-Country Fleet Management
- **Operations:** Global (100+ countries supported)

## Tech Stack
- **Backend:** FastAPI (Python)
- **Frontend:** React (responsive web app)
- **Database:** MongoDB
- **AI/ML:** OpenAI GPT-5.2 (Predictive Maintenance), OpenAI Vision (OCR)
- **Authentication:** JWT-based role authentication
- **Email:** Resend (configured with domain: alerts.jrfleetsolutions.com)

## User Roles & Access Control (Updated Dec 2025)
| Role | Access Level | Approval | Features |
|------|-------------|----------|----------|
| Group Fleet Manager | All countries, all features | Auto-approved | Full system admin, approves all users |
| Fleet Manager | Country-level management | Requires Group Manager approval | Can approve Fleet Officers and below within country |
| Fleet Officer | Country-level operations | Requires Manager approval | Fuel entry for drivers in their country |
| Driver | Personal data only | Requires Manager approval | Pre-Trip Check, Logbook, Requests, Personal Reports |
| User | Personal data only | Requires Manager approval | Same as Driver |

## Core Modules (All Implemented ✅)

### 1. Authentication & User Management
- Role-based login (email/password) with 5 roles
- User registration with approval workflow
- Group Fleet Manager controls all user access
- Session management with JWT tokens
- **Forgot Password / Reset Password** - Email-based password recovery (Dec 2025)
- **Password Visibility Toggle** - Show/hide password for all password fields (Dec 2025)
- **Confirm Password** - Registration form now requires password confirmation (Dec 2025)
- **Country Selection** - 100+ countries with search functionality (Dec 2025)
- **Fleet Officer Restriction** - Fleet Officers cannot add Fleet Managers (Jan 2026)

### 2. Dashboard with Role-Based Views (Updated Jan 2026)
**Manager Dashboard (Staff):**
- Fleet statistics by country
- Country-scoped data for Fleet Managers/Officers (only see their country)
- Group Fleet Manager sees all countries with filter dropdown
- Compliance status indicators (compliant, non-compliant, expiring soon)
- Active alerts with severity levels
- **Pending Accounts Section** - Below compliance, shows 4 users with "View All" button (Jan 2026)
- **Pending Requests Section** - Below pending accounts, shows 4 requests with "View All" button (Jan 2026)

**Driver/User Personal Dashboard:**
- Personal activity stats (trips, distance, fuel efficiency)
- Quick actions (Pre-Trip Check, Logbook, New Request, Metrics)
- Assigned vehicle info
- Recent requests status
- Pre-trip checklist status banner
- Safety score display

### 3. Driving Metrics (New - Dec 2025)
- Separated from Driver Logbook as standalone page
- GPS/Telematics performance data
- Period selector (7/30/90 days)
- Metrics: Distance, Trips, Fuel Efficiency, Fuel Used
- Safety Metrics: Speed Violations, Harsh Braking, Harsh Acceleration
- Overall Driving Score with rating

### 4. Vehicle Management
- Vehicle registration across all countries
- Status tracking (Active/Maintenance/Inactive)
- Location tracking (GPS + Manual backup)

### 5. Driver Management
- Driver profiles by country
- Safety scoring system
- License and document tracking

### 5. Maintenance & Requests (Updated Jan 2026)
- Maintenance records with AI predictions
- **Authorization Workflow:**
  - Driver/Fleet Officer submits request
  - Fleet Manager receives notification
  - Manager approves or rejects (with reason)
  - Driver notified of decision
- **Action Logging:** Tracks when manager submits request on behalf of driver
  - `submitted_by_id`, `submitted_by_name`, `submitted_by_role` fields
  - UI shows "Submitted By" column with role badge or "Self" indicator

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
- `/api/dashboard/stats` - Fleet-wide statistics
- `/api/dashboard/staff` - Country-scoped dashboard for Fleet Managers/Officers (NEW Jan 2026)
- `/api/dashboard/personal` - Personal dashboard for Drivers/Users
- `/api/dashboard/alerts` - Active alerts
- `/api/dashboard/compliance` - Compliance summary
- `/api/vehicles/` - Vehicle CRUD
- `/api/drivers/` - Driver CRUD
- `/api/maintenance-requests/` - Request workflow (with submitted_by tracking)
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
- [ ] Add graphs/charts to dashboards (charting library)
- [ ] Complete UI for empty modules: TireManagement, VendorManagement, Reports/TCO, Vehicle Map
- [ ] Implement User Approval UI in UserManagement.js page
- [ ] Implement Maintenance Approval UI for managers
- [ ] Refactor backend monolith (server.py, models.py → modular structure)
- [ ] Offline Mode (PWA with sync)
- [ ] Native Mobile App (separate project)
- [ ] GPS device integration
- [ ] PDF report export

## Files Reference
- Backend: `/app/backend/server.py`, `/app/backend/models.py`
- Auth: `/app/backend/auth_service.py`
- Email: `/app/backend/email_service.py`
- Frontend: `/app/frontend/src/pages/`
- Auth Context: `/app/frontend/src/contexts/AuthContext.js`

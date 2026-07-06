# UX improvements — agreed scope & implementation plan

Decisions captured from product review (July 2026).

## Summary of requirements

| # | Feature | Decision |
|---|---------|----------|
| 1 | Edit / delete | All main modules; **hard delete** with confirmation; edit via **same dialog as create** (pre-filled) |
| 2 | Document upload | **OCR flow** + files stored in **S3** |
| 3 | Form reset | **All forms**: close dialog + clear fields + refresh list on successful create **and** edit |
| 4 | Countries | **Global ISO 3166-1 alpha-2** in DB; migrate `GHANA`→`GH`, `LIBERIA`→`LR`, `SAO_TOME`→`ST`; UI shows name, stores code |
| 5 | Branding | **GTI Fleet** everywhere; remove Emergent product branding |

## Permissions (delete)

| Role | Delete |
|------|--------|
| **Group Fleet Manager** | All entity types (hard delete) |
| **Fleet Manager** | All entity types (hard delete) |
| **Fleet Officer** | **Limited**: logbook, maintenance requests, pre-trip checklists — **not** vehicles, drivers, assets, vendors, tires |
| **Driver / User** | No delete |

All deletes must write an **audit log** (`audit_logs` collection): who, what, when, entity id/type.

Implementation: `backend/audit_service.py` (`can_hard_delete`, `write_audit_log`).

## Phase 1 — Quick wins (complete)

- [x] Branding: browser title, meta, app name, local logo (`/gti-logo.png`)
- [x] Countries: ISO alpha-2 backend models + startup migration + `CountrySelect` on all main pages
- [x] Form reset: `completeDialogSubmit` on create dialogs (Vehicles, Drivers, Documents, Tires, Vendors, Inventory, Expenditures, Vehicle Map, Logbook)
- [x] Audit foundation: `audit_service.py` with FM/GFM vs FO delete rules (wired in Phase 2 routes)

## Phase 2 — CRUD UI (complete)

- [x] Vehicles: edit (same dialog) + delete with confirm + audit log
- [x] Drivers: edit (same dialog) + delete with confirm + audit log
- [x] Shared `ConfirmDeleteDialog` + `permissions.js` (FM/GFM delete; FO edit-only on vehicles/drivers)
- [x] Vendors, Tires, Documents: edit + delete (managers)
- [x] Maintenance requests: edit pending (staff/driver) + delete (officers + managers)
- [x] Driver logbook: edit + delete (officers + managers; drivers edit own in personal view)
- [x] Inventory, Fuel, Expenditures, Assets, Safety: edit + delete (managers; staff edit)
- [x] Pre-trip checklists: edit (staff or owning driver) + delete (officers + managers)

## Phase 3 — Documents + S3 + OCR

1. Configure `S3_BUCKET_NAME`, `AWS_REGION`, credentials in `backend/.env`
2. Upload endpoint: store file in S3, persist `file_url` / `s3_key` on document record
3. Wire Documents UI: file picker → upload → optional OCR (`/documents/{id}/ocr` or existing route)
4. View/download link from S3 presigned URL

## Form UX standard

```javascript
import { completeDialogSubmit } from '../utils/formUtils';

await completeDialogSubmit({
  submit: () => axios.post(...),
  setDialogOpen,
  setFormData,
  initialFormData: INITIAL_FORM,
  onSuccess: fetchData,
  successMessage: 'Saved.',
});
```

After **edit**: close dialog, refresh list (same as create) — do not leave dialog open.

## Country standard

- **API / DB:** ISO alpha-2 (`GH`, `US`, …)
- **UI:** dropdown label = country name from `/api/countries/all-list`
- **User registration:** store ISO code in `users.country` (migrate legacy names on read)

## Branding standard

- Product name: **GTI Fleet** (or **GTI Fleet Solutions** in marketing copy)
- No Emergent scripts in `index.html` for production builds
- Logo: host under `frontend/public/` when asset is available locally

# Database Architecture and Sizing

## Brief description

The system uses a **document-oriented database** accessed as **MongoDB** over the wire (async **Motor** / **PyMongo**). Schema is expressed as **collections** (20+), with **UUID** identifiers, **country-scoped** fleet data, and indexes on hot query paths. On AWS pilot docs reference **Amazon DocumentDB** (MongoDB-compatible API); on-prem you would run **MongoDB Community/Enterprise** or another **MongoDB 4.2+ compatible** deployment that supports the same drivers and aggregation features you rely on.

## Type and structure

- **Engine:** MongoDB-compatible document database  
- **Database name (example):** `fleet_management` (from env `DB_NAME`)  
- **Collections (examples):** `countries`, `vehicles`, `drivers`, `maintenance_records`, `workshop_jobs`, `inventory_items`, `inventory_transactions`, `fuel_transactions`, `expenditures`, `documents`, `assets`, `safety_incidents`, `exchange_rates`, `ai_predictions`, `users`, `alerts`, `compliance_checks`, and others per `DATABASE_SCHEMA.md` and `SYSTEM_DESCRIPTION_FOR_CLOUD_ENGINEERS.txt`  
- **Multi-tenancy:** Logical isolation by `country` (GHANA | LIBERIA | SAO_TOME) and RBAC at API layer  
- **Indexes:** Recommended compound and single-field indexes documented in `DATABASE_SCHEMA.md` (e.g. `vehicles`: `country+status`, `registration_number`; `fuel_transactions`: `vehicle_id+date`, etc.)

## Connection pattern

- Connection string via `MONGO_URL`  
- Pilot note: on the order of **~150 concurrent connections** targeted for ~700 concurrent users (validate under your connection pool settings)  
- **TLS:** Required in production for data in transit; DocumentDB-style TLS parameters may apply if using compatible services

## Storage sizing (from project documentation — refine with ops)


| Item                       | Pilot-phase guidance        | Notes                                             |
| -------------------------- | --------------------------- | ------------------------------------------------- |
| **Initial data footprint** | ~**10 GB**                  | Starter for pilot dataset                         |
| **Growth**                 | ~**2 GB/month** (estimated) | Depends on fleet size, document volume, retention |
| **Annual growth (rough)**  | ~**24 GB/year** if linear   | Replace with measured metrics after go-live       |


## Files are not “in the database”

- Large binaries (**PDF, images**) are stored in **object storage**; MongoDB holds **metadata and URLs**  
- Object storage sizing is separate (~**5 GB** pilot expectation over 6 months in cloud doc; adjust for on-prem object store)

## Backup and retention (design discussion)

- **Pilot:** short backup retention may be acceptable per business sign-off  
- **Production:** align RPO/RTO with finance/compliance; enable point-in-time or regular snapshots; test restores  
- **Encryption at rest:** required per security section of system description

## Scaling trajectory

- Workload described as **read-heavy (~80% reads / 20% writes)**  
- **Read replicas** and sharding are future options if data or QPS grows

## Reference

- Full field-level schema: `DATABASE_SCHEMA.md`  
- Cloud pilot sizing example (single small instance): `AWS_PILOT_REQUIREMENTS.md`


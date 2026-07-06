# Data Centre Deployment Guide — GTI Fleet Solutions

This guide targets **four servers** in the data centre:

| Allocation | Count | Purpose |
|-------------|-------|---------|
| **UAT** | **1** | Pre-production: integrated stack for testing and release validation |
| **Production** | **3** | Live workload: application tier + **MongoDB replica set** (two data nodes + one arbiter) |

Stack: **React** frontend, **FastAPI** backend, **MongoDB**, optional **Redis** / **MinIO**, email via **Resend**.

**Command-by-command production runbook (MongoDB replica set, Nginx, systemd, firewall):** [`PRODUCTION_DEPLOYMENT_RUNBOOK.md`](PRODUCTION_DEPLOYMENT_RUNBOOK.md).

**Current production target OS:** **CentOS Stream 9** — use **`dnf`**, **`firewalld`** (not UFW), RHEL-style **Nginx** (`/etc/nginx/conf.d/`, `nginx` user), and **SELinux** booleans for reverse-proxy → FastAPI. The runbook matches this stack.

---

## 1. Server inventory (4 servers)

### 1.1 UAT — Server U1

| Field | Detail |
|-------|--------|
| **Role** | Full **non-HA** environment on a single host |
| **Typical workloads** | Nginx (TLS + static React + reverse proxy to API), FastAPI, **MongoDB single instance**, optional Redis for parity with prod patterns |
| **Sizing (starting point)** | 4 vCPU, 16 GB RAM, 120+ GB SSD (increase if you load production-like datasets) |

**Why one server for UAT:** Cost and simplicity. UAT does **not** need MongoDB failover; it needs fast iteration, smoke tests, and release sign-off. Use **different hostnames, secrets, and database** than production.

**Optional on UAT:** MinIO in single-node mode if you test document uploads against object storage; otherwise defer.

---

### 1.2 Production — Servers P1, P2, P3

| Server | Role | Typical sizing |
|--------|------|----------------|
| **P1** | **Application** + **MongoDB arbiter** | 4 vCPU, 8–16 GB RAM, 60+ GB SSD — app is the main consumer of RAM/CPU; arbiter is negligible |
| **P2** | **MongoDB data member** (e.g. primary) | 4 vCPU, 16–32 GB RAM, fast SSD (200+ GB to start; grow with data) |
| **P3** | **MongoDB data member** (e.g. secondary) | Same class as P2 |

**Replica set layout:** **Two data-bearing members** (P2, P3) + **one arbiter** (P1) gives automatic primary election if **one data node** fails, without a fourth physical machine. The arbiter never holds data; it only participates in votes.

**What runs on P1**

- Nginx: TLS, React `build/`, proxy `/api` → FastAPI on localhost (or container network).
- FastAPI (Gunicorn/Uvicorn workers).
- `mongod` **arbiter** instance (separate `dbPath` and port if you run multiple `mongod` on one host — use distinct config files; only the arbiter shares P1 with the app).

**Important:** Keep **application logs and MongoDB data paths** on separate disks if possible on P1 (reduces I/O contention). Prefer **two disks** on P1: system + app vs. tiny arbiter metadata.

---

## 2. Architecture diagrams

### 2.1 UAT (single server)

```text
Users / testers
      │
      ▼
┌─────────────────────────────────────┐  :443 / :80
│  U1 — Nginx + React + FastAPI       │
│       MongoDB (standalone)          │
│       [optional Redis / MinIO]      │
└─────────────────────────────────────┘
```

### 2.2 Production (three servers)

```text
Users
  │
  ▼
┌──────────────────────┐
│ P1 — Nginx + React   │  :443 / :80 (only user-facing production entry)
│      + FastAPI       │
│      + Mongo arbiter │  :27018 (example; internal only)
└──────────┬───────────┘
           │  private VLAN
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌─────────┐
│ P2      │ │ P3      │   MongoDB data nodes :27017
│ mongod  │ │ mongod  │   replica set (e.g. rs0)
└─────────┘ └─────────┘
```

DNS example:

- UAT UI/API: `https://uat-fleet.example.com` (or split `uat-app` / `uat-api` if you prefer).
- Production UI/API: **`https://fleet.gtiholding.com`** (single host + Nginx `/api` proxy — recommended; see [`PRODUCTION_DOMAIN.md`](PRODUCTION_DOMAIN.md)). Split hostnames (e.g. `api.fleet.gtiholding.com`) are optional if `CORS_ORIGINS` and `REACT_APP_BACKEND_URL` match what browsers call.

---

## 3. Network, firewall, and ports

### 3.1 UAT (U1)

| Exposure | Ports | Notes |
|----------|-------|--------|
| To testers / corporate network | **443**, **80** | Same hardening as prod; restrict by IP/VPN if policy requires |
| MongoDB | **27017** | **Bind to localhost only** on U1 if the app is co-located; do not expose to WAN |

### 3.2 Production

| Host | Expose publicly | Internal only |
|------|-----------------|---------------|
| **P1** | **443**, **80** | FastAPI backend port (e.g. 8000) localhost-only behind Nginx |
| **P2, P3** | *none* | **27017** MongoDB — reachable **only** from P1 (and from P2↔P3 for replication) |
| **P1** arbiter | *none* | Arbiter port — reachable only from P2/P3/P1 for replica set chatter |

On **RHEL-family** hosts, implement the above with **`firewall-cmd`** rich rules (see runbook). **`public`** zone may still allow **`ssh`** globally unless you **`--remove-service=ssh`** and replace with source-restricted rules.

### 3.3 Egress

Allow **outbound HTTPS** from **U1, P1** (app layers) for Resend, future AI APIs, and patching. **P2/P3** typically need **no** general internet.

### 3.4 Segmentation

- Place **UAT** and **production** on **separate VLANs** or subnets where possible.
- **Never** point UAT `MONGO_URL` at production MongoDB.

---

## 4. MongoDB configuration

### 4.1 UAT — standalone

1. Install MongoDB (same **major version** as production).
2. Bind to `127.0.0.1` if only local FastAPI connects.
3. Create app user and `DB_NAME` (e.g. `fleet_management_uat`).
4. `MONGO_URL` example:  
   `mongodb://uat_app:PASSWORD@127.0.0.1:27017/fleet_management_uat?authSource=admin`

### 4.2 Production — replica set (P1 arbiter + P2 + P3)

1. Install the **same MongoDB major version** on all three hosts.
2. **P2, P3:** `mongod` as replica set members with **voting** and **data**.
3. **P1:** run a separate **`mongod` arbiter** process (unique `port` and `dbPath`, no data).
4. Initialise replica set, e.g. `rs0`, with members:
   - `p2.internal:27017`
   - `p3.internal:27017`
   - `p1.internal:27018` (arbiter)
5. Application connection string (FastAPI on **P1**):  
   `mongodb://prod_app:PASSWORD@p2.internal:27017,p3.internal:27017/fleet_management?replicaSet=rs0&authSource=admin`  
   Include the arbiter host in the replica set config **only** via `rs.addArbiter(...)` — the driver seed list often lists **data nodes**; ensure **all replica set members** are resolvable from P1 and from each other.

6. **Backups:** schedule continuous backups from a secondary (e.g. P3) or use a supported backup tool; **test restore** on UAT or an isolated restore VM.

---

## 5. Environment variables (UAT vs production)

Use **`backend/.env.example`** as the checklist. Critical differences:

| Variable | UAT (U1) | Production (P1) |
|----------|----------|------------------|
| `ENVIRONMENT` | `development` or a dedicated `uat` value if you add one | `production` |
| `MONGO_URL` | Standalone URI on U1 | Replica set URI (P2/P3 + `replicaSet=`) |
| `DB_NAME` | e.g. `fleet_management_uat` | e.g. `fleet_management` |
| `JWT_SECRET_KEY` | UAT-only secret | **Different** strong secret |
| `CORS_ORIGINS` | UAT frontend URL(s) | Production frontend URL(s) |
| `FRONTEND_URL` | UAT URL | Production URL |
| `RESEND_API_KEY` | Can be same or separate sender | Production sender / domain per policy |

Frontend build:

- UAT: `REACT_APP_BACKEND_URL=https://uat-api.example.com` (or your chosen UAT API URL).
- Prod: `REACT_APP_BACKEND_URL=https://fleet.gtiholding.com` (same origin as the UI when using path-based `/api` proxy).

---

## 6. Application deployment (FastAPI + Nginx + React)

Applies to **U1** and **P1** with the same mechanical steps; only env and TLS names change.

### 6.1 Backend

**Option A — venv + systemd**

1. Python 3.11+ (or project requirement), venv, `pip install -r backend/requirements.txt`.
2. Gunicorn + Uvicorn worker, bind `127.0.0.1:8000`.
3. `systemd`: `Restart=always`, dedicated user, env file with permissions `600`.

**Option B — Docker**

1. Container on host with private network access to MongoDB (U1: link to local mongo; P1: route to P2/P3).

### 6.2 Frontend

1. Build on CI or build host with the correct `REACT_APP_BACKEND_URL` for that environment.
2. Deploy `build/` to Nginx document root.
3. SPA: `try_files $uri /index.html;`.

### 6.3 Nginx

- TLS certificates per hostname (UAT vs prod).
- Proxy `/api` → `http://127.0.0.1:8000` (or upstream name).
- Rate limit auth endpoints.

---

## 7. Redis and MinIO (optional)

| Service | UAT | Production (4-server budget) |
|---------|-----|------------------------------|
| **Redis** | Optional on U1 for behaviour parity | Optional **on P1** only if needed; keep bound to private/localhost |
| **MinIO** | Optional single node on U1 | **Not on a fourth server** in this model — run **single-node MinIO on P1** (extra disk) or add storage later; distributed MinIO needs more hosts |

---

## 8. Secrets, monitoring, backups

- **Secrets:** separate credentials for UAT and prod; no shared `JWT_SECRET_KEY` or DB passwords.
- **Monitoring:** at minimum, **node health** on all four servers, **MongoDB replication lag** on P2/P3, **Nginx + app logs** on U1 and P1. Centralise if you have a logging stack.
- **Backups:** UAT — optional/weekly; **production** — automated + quarterly restore drill.

---

## 9. Pre-deployment checklist (4-server programme)

- [ ] U1 provisioned; P1, P2, P3 provisioned on private network.
- [ ] DNS and TLS for UAT vs production.
- [ ] MongoDB version aligned across U1, P2, P3; **prod replica set** initialised and **not** reachable from UAT subnet except admin tooling if required.
- [ ] Firewall: only P1 serves **443/80** for prod users; P2/P3 **no inbound** from internet.
- [ ] `CORS_ORIGINS` / `FRONTEND_URL` / `REACT_APP_BACKEND_URL` triple-checked per environment.
- [ ] Production backup and restore runbook tested once before go-live.

---

## 10. Go-live validation

**UAT (U1)**

1. Login, role flows, CRUD smoke tests.
2. Forgot-password email and link target `FRONTEND_URL` for UAT.

**Production**

1. Same functional checks on production URLs.
2. From outside DC: only **443** (and **80**) to **P1**; **27017** on P2/P3 not reachable from untrusted networks.
3. Failover drill: stop primary on P2 or P3; confirm replica set elects new primary and API recovers after brief reconnect.

---

## 11. Risks and limitations (this topology)

- **Two data nodes** + arbiter tolerates **one data server failure**. Losing **P1** loses the app **and** the arbiter; replica set may still have a primary on the surviving data node, but **users cannot connect** until P1 is restored or you repoint DNS to a standby app host (not in the 4-server budget). Mitigation: priority on **P1** hardware redundancy / fast rebuild.
- **No second application server** in the 3-server prod split — P1 is a **single point of failure for the web/API tier**. Accept for this budget or add a fifth server for app HA later.
- UAT on one server is **not** a capacity or HA stand-in for production.

---

## 12. Document history

| Version | Date | Notes |
|---------|------|--------|
| 1.0 | 2026-05-01 | Initial DC guide |
| 2.0 | 2026-05-01 | Tailored to **4 servers**: **1 UAT + 3 production** (app+arbiter, 2× MongoDB data) |

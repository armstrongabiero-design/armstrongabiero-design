# Architecture — JR Fleet Management System

## Brief description

The JR Fleet Management System is a **web application** for multi-country fleet operations (Ghana, Liberia, São Tomé and Príncipe). Functionally it splits into a **SPA frontend**, a **stateless REST API backend**, a **MongoDB-compatible document database**, and **integrations** for object storage, email, foreign-exchange rates, and AI APIs. For on-prem deployment, the same logical components apply; only the hosting substrate changes (VMs or Kubernetes on your estate instead of managed cloud services).

## Deployment style

- **Not a single monolith in one process:** the **frontend** is a static React build; the **backend** is one FastAPI application process (single deployable service today), exposing 100+ HTTP endpoints under `/api`.
- **Practical classification:** **modular monolith API** + **separate static frontend** + **external database**. The codebase is structured for horizontal scaling of the API tier (stateless JWT auth, no required in-memory session cluster).
- **Microservices:** not decomposed into separate deployable microservices in the current codebase; future splitting (e.g. AI worker) would be an evolution, not a current requirement.

## Components

| Layer | Technology | Role |
|-------|------------|------|
| **Frontend** | React 19, React Router, Radix UI, Tailwind, Axios | Browser UI; 25+ dashboard pages; talks to backend over HTTPS |
| **Backend** | Python 3.11+, FastAPI, Uvicorn | REST API, JWT auth, RBAC, business logic, orchestration of DB and external calls |
| **Database** | MongoDB-compatible (Motor/PyMongo async driver) | Document store: 20+ collections (vehicles, drivers, maintenance, fuel, users, documents metadata, etc.); country-scoped multi-tenancy |
| **Object storage** | S3 API–compatible (cloud: AWS S3; on-prem: e.g. MinIO, NetApp, or vendor S3 gateway) | Document uploads (PDF/images); presigned or server-side upload patterns as implemented |
| **Email** | **Resend** HTTPS API (`resend` package); sender via `RESEND_API_KEY` + `SENDER_EMAIL` | Password reset, maintenance/driver notifications, scheduled reports |
| **External APIs** | HTTPS | Google Gemini (AI), Hugging Face (models), forex rates (via `forex-python` / network) |

## Reference topology (example)

```
Internet / corporate users
        │
        ▼
[ Reverse proxy / load balancer — e.g. NGINX, HAProxy, F5 ]
        │
        ├──────────────────────┐
        ▼                      ▼
[ Static files: React build ]   [ API tier: Uvicorn → FastAPI :8000 ]
        │                      │
        │                      ├──► [ MongoDB primary — optionally replicas ]
        │                      ├──► [ S3-compatible object storage ]
        │                      └──► [ Outbound HTTPS: Gemini, HF, FX APIs ]
        │
        └── (optional CDN — on-prem or shared edge)
```

- **Frontend** can be served from the same reverse proxy as static assets or from a dedicated web server host.
- **Backend** should sit behind TLS termination; multiple API instances behind a load balancer are supported by design (stateless).

## Pilot vs production posture

- **Pilot:** single DB instance, modest compute, 95% uptime target acceptable per existing project docs.
- **Production (future):** add **read replicas**, **multi-node DB**, **Redis** (optional cache), stronger backup/RPO-RTO; same application architecture.

## Related documents

- Service request path: [02-service-flow.md](02-service-flow.md)  
- Ports and network: [08-network-ports.md](08-network-ports.md), [07-network-requirements.md](07-network-requirements.md)

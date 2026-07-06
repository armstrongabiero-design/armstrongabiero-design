# Project Deployment Brief (DC / Non-AWS)

This brief proposes a practical, production-ready setup for the current stack (`React` frontend, `FastAPI` backend, `MongoDB`, email via `Resend`, AI integrations planned).

**Agreed DC footprint (4 servers):** **1 server = UAT** (all-in-one for pre-prod testing); **3 servers = production** — application + MongoDB arbiter on one host, **two** MongoDB data nodes on the other two hosts. Architecture and env split: [`docs/DC_DEPLOYMENT_GUIDE.md`](docs/DC_DEPLOYMENT_GUIDE.md). **Command runbook (CentOS Stream 9 / `dnf` / firewalld):** [`docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`](docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md).

**Production public URL:** [`https://fleet.gtiholding.com`](https://fleet.gtiholding.com) — env/CORS/TLS/rebuild checklist: [`docs/PRODUCTION_DOMAIN.md`](docs/PRODUCTION_DOMAIN.md).


| Area              | Recommendation                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment Setup  | Deploy frontend and backend on **separate services** (can be on same VM for small environments, but logically separated).                                                                                                                                                        |
| Architecture      | Recommended flow: **Load Balancer/Reverse Proxy (Nginx/Traefik) -> Frontend (React static build) + Backend (FastAPI/Uvicorn/Gunicorn) -> MongoDB**. Add Redis and object storage as internal services.                                                                           |
| Hosting Approach  | **Native packages on RHEL-family VMs** (`dnf`, Nginx, systemd) is the documented path for the current DC; **Docker Compose** remains a valid alternative if your ops standard prefers containers.                                                                                                                                                     |
| Database          | Replace DocumentDB with **MongoDB Community/Enterprise replica set** (3-node preferred for HA; 1-node acceptable for dev/UAT).                                                                                                                                                   |
| File Storage      | Replace S3 with **MinIO** (S3-compatible API). This minimizes app code changes if SDK abstractions are used.                                                                                                                                                                     |
| Caching           | **Redis is recommended** (sessions/rate limiting/background jobs/cache). Not strictly required for day-1, but strongly advised for production stability/performance.                                                                                                             |
| Secrets           | Use a **central secrets manager** (HashiCorp Vault, Doppler, or sealed env files with strict ACLs).                                                                                                                                                                              |
| Monitoring        | Baseline stack: **Prometheus + Grafana** (metrics), **Loki + Promtail** or ELK/OpenSearch (logs), **Sentry** (app errors), uptime checks + alerting (email/Slack).                                                                                                               |
| External Services | Internet egress needed for: **Resend email API**, future **AI APIs** (e.g., OpenAI), package/security updates, optional map/geocoding providers. Internal-only components can run without internet.                                                                              |
| Offline Scenario  | Full offline operation is **limited** because email/AI/external APIs need internet. Core local CRUD can continue if all services are hosted in DC. Introduce job queues/retries for delayed sync after reconnect.                                                                |
| Infra Sizing      | **Minimum starting point**: Backend 2 vCPU / 4-8 GB RAM / 20-40 GB disk; MongoDB 4 vCPU / 8-16 GB RAM / 100+ GB SSD; Frontend (Nginx static) 1 vCPU / 1-2 GB RAM. Increase based on user load and retention.                                                                     |
| Networking        | Expose externally: `80/443` (LB). Keep backend (`8000`) and MongoDB (`27017`) **internal/private** only. Redis (`6379`) internal only.                                                                                                                                           |
| Code Changes      | Likely required: remove AWS SDK/env assumptions, switch storage adapter to MinIO endpoint/credentials, replace any DocumentDB-specific connection settings with MongoDB replica set config, update deployment/env docs. An ongoing configured deployment pipeline will be ideal. |
| Risks             | Key risks: single-node DB SPOF, missing backups/restore drills, weak secret handling, no queue for outbound integrations, and future AI/email dependence on internet. For DC, plan HA, backup, and observability early.                                                          |


## Suggested Phased Rollout

1. **UAT on 1 VM**: Standalone MongoDB + Nginx + React + FastAPI; separate DNS, secrets, and DB name from production.
2. **Production on 3 VMs**: Replica set (2 data + 1 arbiter co-located with app), TLS on app host only, backups and failover drill — see [`docs/DC_DEPLOYMENT_GUIDE.md`](docs/DC_DEPLOYMENT_GUIDE.md).
3. **Later scale**: Second app server or Kubernetes only if traffic or ops requirements exceed this 4-server model.


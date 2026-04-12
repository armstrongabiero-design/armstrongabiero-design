# Application Server Requirements

## Brief description

The runtime surface is: **Python ASGI server** for the API, **MongoDB-compatible database**, optional **reverse proxy** for TLS and static frontend, and **S3-compatible object storage**. Builds require **Node.js** and **Yarn/npm** only on build hosts or CI, not on minimal API machines if you ship containers.

## Backend (API)

| Component | Version / detail |
|-----------|------------------|
| **Language** | Python **3.11+** |
| **Framework** | FastAPI **0.110.1** (pinned in `backend/requirements.txt`; minor upgrades test before prod) |
| **ASGI server** | Uvicorn **0.25.0** |
| **Process model** | Typical: `uvicorn server:app --host 0.0.0.0 --port 8000` (adjust workers per CPU; multiple workers recommended behind load balancer) |
| **Health** | Load balancers need a stable HTTP check; **define** `GET /health` or `GET /api/health` if not already present (referenced in deployment notes — confirm against `backend/server.py` in your branch) |

## Python dependencies (summary)

- **DB:** Motor **3.3.1**, PyMongo **4.5.0**  
- **Auth:** PyJWT **2.10.1**, bcrypt **4.1.3**, cryptography **46.0.3**  
- **Cloud SDK (if using AWS S3):** boto3 **1.42.21** (object storage)
- **Email:** **resend** **2.21.0** (transactional mail via Resend API)  
- **AI:** `google-generativelanguage` / `google-generativeai` stack as in `requirements.txt`  
- **Other:** `forex-python`, `email-validator`, `dnspython`, etc. (~131 declared lines in requirements — install via `pip install -r backend/requirements.txt` in controlled venv/container)

**Install pattern:** Python venv or container image (e.g. `python:3.11-slim`) with frozen requirements.

## Frontend (build and serve)

| Component | Version / detail |
|-----------|------------------|
| **Runtime (browser)** | React **19.x** (see `frontend/package.json`) |
| **Build** | Create React App with **CRACO**; **Tailwind** 3.4.x, **PostCSS** |
| **Package manager** | **Yarn 1.22.x** (specified via `packageManager` in package.json) or npm if policy requires |
| **Node.js for build** | Use current **Active LTS** (e.g. **Node 20.x**); Node 18 LTS minimum recommended |

**Build commands (typical):**

```bash
cd frontend && yarn install && yarn build
```

Output: static assets under `frontend/build/` — deploy to object storage, NGINX, or CDN.

## Reverse proxy / edge (recommended)

- **NGINX**, **HAProxy**, or enterprise load balancer: **TLS 1.2+**, HTTP/2 optional, gzip/brotli for static assets  
- **No Tomcat/Java** required for this stack  

## Optional tooling

- **Docker / containerd** — if standard in your org  
- **Systemd** — manage Uvicorn process on VMs  
- **cert-manager / internal PKI** — for TLS certificates  

## Sizing hints (starting point)

Pilot-oriented figures from project docs: API tier sized for ~**700 concurrent users**, ~**150 DB connections**, horizontal scale by adding API instances. Exact vCPU/RAM should follow your load test; see [06-traffic-and-capacity-projections.md](06-traffic-and-capacity-projections.md).

## Environment variables (non-exhaustive)

Infrastructure must inject secrets securely (vault, not plain text in images):

- `MONGO_URL`, `DB_NAME`  
- `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT` / token expiry settings  
- `AWS_*` or S3-compatible endpoints if object storage is API-compatible  
- `GOOGLE_GEMINI_API_KEY`, `HUGGING_FACE_TOKEN`  
- Email: `RESEND_API_KEY`, `SENDER_EMAIL` (verified in Resend)  
- CORS: allowed frontend origins  

Full list: `SYSTEM_DESCRIPTION_FOR_CLOUD_ENGINEERS.txt` (Environment Configuration section).

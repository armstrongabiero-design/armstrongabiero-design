# Run locally (local MongoDB)

Use **Docker MongoDB on `127.0.0.1:27017`** for development. **Production** uses the replica set on the DC hosts — see [`backend/.env.example`](backend/.env.example) and [`docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`](docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md).

---

## 1. Start MongoDB

From the **repository root**:

```bash
docker compose up -d
```

Verify:

```bash
docker compose ps
# optional: mongosh mongodb://127.0.0.1:27017 --eval 'db.runCommand({ ping: 1 })'
```

Stop when done: `docker compose down` (add `-v` only if you want to wipe data).

---

## 2. Backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.local.example .env   # or edit existing .env
```

**Minimum `backend/.env` for local:**

| Variable | Value |
|----------|--------|
| `MONGO_URL` | `mongodb://127.0.0.1:27017` |
| `DB_NAME` | `fleet_management` |
| `ENVIRONMENT` | `development` |
| `JWT_SECRET_KEY` | Any long random string |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` |
| `FRONTEND_URL` | `http://localhost:3000` |

Run API:

```bash
source .venv/bin/activate
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

- Health: http://127.0.0.1:8000/health  
- API: http://127.0.0.1:8000/api  

---

## 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

**`frontend/.env`:**

```bash
REACT_APP_BACKEND_URL=http://127.0.0.1:8000
```

App: http://localhost:3000  

---

## 4. First admin (empty local DB)

1. Set `BOOTSTRAP_TOKEN` in `backend/.env`.
2. Open http://localhost:3000/admin-register  
3. Register the first Group Fleet Manager.

---

## Local vs production MongoDB

| | **Local** | **Production** |
|---|-----------|----------------|
| **URI** | `mongodb://127.0.0.1:27017` | Replica set `rs0` on `.22` / `.23` |
| **Auth** | None (Docker default) | `fleetapp` user + `authSource` |
| **Template** | `backend/.env.local.example` | `backend/.env.example` |
| **Start** | `docker compose up -d` | `mongod` on DC servers (runbook) |

**Do not** point local `.env` at production Mongo unless you intend to hit live data (VPN/tunnel required).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `MONGO_URL environment variable is required` | Create `backend/.env` from `.env.local.example` |
| Connection refused on 27017 | `docker compose up -d` from repo root |
| CORS errors | Set `CORS_ORIGINS` to include `http://localhost:3000` |
| Still hitting DC replica set | Check `MONGO_URL` in `backend/.env` — must be `127.0.0.1`, not `192.168.135.*` |

More detail: [`docs/side_doc/LOCAL_DEV.md`](docs/side_doc/LOCAL_DEV.md)

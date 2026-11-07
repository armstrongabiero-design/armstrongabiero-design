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

---

## Running tests

From the **repository root**, with dev tools installed (`pip install -r backend/requirements-dev.txt`):

```bash
pytest backend/tests/test_authorization.py backend/tests/test_protrack.py   # no database or running server needed
```

Plain `pytest` also runs the older live-API tests, which skip unless `REACT_APP_BACKEND_URL` and test logins are set. See `backend/tests/http_helpers.py`.

## Fleet Map with simulated GPS

`backend/tests/protrack_mock.py` stands in for the ProTrack365 API, with vehicles driving around Accra, Monrovia and São Tomé. To use it, run it beside the backend:

```bash
cd backend
PROTRACK_MOCK_PLATES="GR-1234-20,LR-A-1001" uvicorn tests.protrack_mock:app --port 8765
```

Then add to `backend/.env` and restart the backend:

```
PROTRACK_BASE_URL=http://127.0.0.1:8765
PROTRACK_ACCOUNT=mock
PROTRACK_PASSWORD_MD5=<md5 of mockpass>      # macOS: printf mockpass | md5
```

For the background map, put a `west-africa.pmtiles` file (see the runbook for how to make one) in `frontend/public/maps/`, or set `REACT_APP_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png` in `frontend/.env` to use OpenStreetMap's tiles while developing.

Set `PROTRACK_MOCK_PLATES` to registration numbers of vehicles in your local database. Matching plates are linked automatically within 10 minutes, or straight away with **Trackers → Sync from ProTrack** on the Fleet Map. To use the real ProTrack account instead, remove `PROTRACK_BASE_URL` and set the real account and password md5.

## Updating dependencies

`backend/requirements.in` lists the packages the backend imports directly. `backend/requirements.txt` is the locked install set, generated from it. To update:

```bash
python3.11 -m venv /tmp/lock && /tmp/lock/bin/pip install -r backend/requirements.in
/tmp/lock/bin/pip freeze   # replace the pinned lines in backend/requirements.txt with this
```

Keep the `cryptography` lines with their platform markers. Intel Macs have no wheels for the newest releases, so they stay on an older version for development only. Servers use the patched one.

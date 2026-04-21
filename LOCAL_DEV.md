# Run the project locally

Assumes **MongoDB is already running** on your machine and **Python 3.11+** and **Node.js 18+** are installed. **Node 20 or 22 LTS** is recommended; very new major versions (e.g. Node 24) can surface toolchain quirks with `react-scripts` / webpack. Connection defaults below use `mongodb://127.0.0.1:27017`—adjust to match your instance (port, auth, replica set, etc.).

---

## 1. Backend (FastAPI)

```bash
cd backend

python3.11 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create environment file (once):

```bash
cp .env.example .env
```

Edit **`backend/.env`** and set at least:

| Variable | Example / notes |
|----------|------------------|
| `MONGO_URL` | `mongodb://127.0.0.1:27017` (or your URI) |
| `DB_NAME` | `fleet_management` (optional; default) |
| `JWT_SECRET_KEY` | Long random string (e.g. `python3.11 -c "import secrets; print(secrets.token_hex(32))"`) |
| `ENVIRONMENT` | `development` |

Optional: `CORS_ORIGINS` (defaults include `http://localhost:3000` in development if unset), `FRONTEND_URL`, `BOOTSTRAP_TOKEN` for first admin bootstrap.

Start the API:

```bash
source .venv/bin/activate
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Check:

- Health: <http://127.0.0.1:8000/health>
- API base: <http://127.0.0.1:8000/api>

---

## 2. Frontend (React)

In a **second** terminal:

```bash
cd frontend
cp .env.example .env
```

Edit **`frontend/.env`** and set the API URL (no trailing slash):

```bash
REACT_APP_BACKEND_URL=http://127.0.0.1:8000
```

Install and run:

```bash
npm install
npm start
# or: npm run dev  (same as start)
```

**npm note:** The repo may include `frontend/.npmrc` with `legacy-peer-deps=true` for React 19 + older peer ranges. `package.json` includes an **`overrides`** entry for **`ajv@8.12.0`** so webpack / `schema-utils` / `ajv-keywords` do not pull a mismatched `ajv` (fixes `Cannot find module 'ajv/dist/compile/codegen'`). After changing overrides, run a clean install:

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm start
```

Open the app (default): <http://localhost:3000>

---

## 3. First admin (empty database)

1. In `backend/.env`, set `BOOTSTRAP_TOKEN` to a secret value; restart the backend.
2. Use **Initial Group Fleet Manager** at `/admin-register` (or call `POST /api/auth/bootstrap` with header `X-Bootstrap-Token` matching that token).
3. Use a **strong** password (see API password policy: length, upper/lower, digit, special character).

---

## 4. Optional: integration tests

With the API running and `backend/.env` loaded:

```bash
# From repository root, with backend venv activated
cd backend && source .venv/bin/activate && cd ..
export REACT_APP_BACKEND_URL=http://127.0.0.1:8000
pytest
```

Set `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` and/or `BOOTSTRAP_TOKEN` in the environment if the suite needs a staff JWT (see `backend/tests/http_helpers.py`).

---

## Troubleshooting

- **`Cannot read properties of undefined (reading 'date')`** (under `fork-ts-checker-webpack-plugin` / `ajv-keywords`) — npm **`overrides`** for **Ajv 8** can leave that plugin’s **nested** old `ajv-keywords` talking to the wrong Ajv API. **`craco.config.js`** removes `ForkTsCheckerWebpackPlugin` so dev/build start (this repo is JS-first; use your editor for TS if you add `.ts` files).
- **`MONGO_URL environment variable is required`** — Create `backend/.env` or export `MONGO_URL` before `uvicorn`.
- **CORS errors in the browser** — Set `CORS_ORIGINS` to include your dev origin, e.g. `http://localhost:3000,http://127.0.0.1:3000`.
- **Cannot install `emergentintegrations`** — It is not on public PyPI; the app’s AI helpers degrade without it (see `backend/ai_services.py`).

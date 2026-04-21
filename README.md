# Fleet Management System (full stack)

Local development uses a **FastAPI** backend (`backend/`), a **React** frontend (`frontend/`), and **MongoDB**.

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** (and npm)
- **Docker** (optional, recommended for MongoDB only)

## 1. MongoDB

**Option A — Docker (recommended)**

From the repository root:

```bash
docker compose up -d
```

This starts MongoDB on `mongodb://127.0.0.1:27017`.

**Option B — Local install**

Install MongoDB 6+ or 7 and ensure it listens on `27017`, or set `MONGO_URL` in `backend/.env` to your connection string.

## 2. Backend

Use **Python 3.11+** (the dependency pins expect 3.10+; on macOS, `python3` may be older—try `python3.11`).

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```

**Note:** `emergentintegrations` is not on PyPI; AI helpers in `ai_services.py` degrade gracefully without it. Install a vendor wheel only if you have one.

Check that the virtualenv installed correctly:

```bash
source .venv/bin/activate
python -c "import fastapi, uvicorn, motor; print('backend deps ok')"
```

Edit `backend/.env` (create it with `cp .env.example .env` if you have not already):

- Set **`JWT_SECRET_KEY`** to a long random value (at least 32 characters for non-placeholder use). You can generate one with:
  ```bash
  python3.11 -c "import secrets; print(secrets.token_hex(32))"
  ```
- Confirm **`MONGO_URL`** matches your MongoDB (default works with Docker compose above).

Start Mongo if you use Docker: from the **repository root**, run `docker compose up -d` before `uvicorn`.

Run the API:

```bash
# From backend/ with venv activated
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

- Health check: `http://127.0.0.1:8000/health`
- API base: `http://127.0.0.1:8000/api`

### First Group Fleet Manager (empty database)

1. Set the same value in `backend/.env` for **`BOOTSTRAP_TOKEN`** (and restart the server).
2. Open the app’s **Initial admin / bootstrap** registration screen (or call `POST /api/auth/bootstrap` with header **`X-Bootstrap-Token`**).
3. Use a strong password (see policy enforced by the API).

## 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm start
```

The dev server defaults to **http://localhost:3000**. Ensure `REACT_APP_BACKEND_URL` in `frontend/.env` matches where uvicorn runs (e.g. `http://127.0.0.1:8000`).

## 4. Integration tests (optional)

From the **repository root** (with backend running and env set):

```bash
cd backend && source .venv/bin/activate && cd ..
export REACT_APP_BACKEND_URL=http://127.0.0.1:8000
export JWT_SECRET_KEY="$(grep JWT_SECRET_KEY backend/.env | cut -d= -f2-)"
# Plus credentials or BOOTSTRAP_TOKEN per backend/tests/http_helpers.py
pytest
```

## Troubleshooting

| Issue | What to check |
|--------|----------------|
| `MONGO_URL environment variable is required` | Create `backend/.env` from `.env.example` or export `MONGO_URL`. |
| CORS errors in the browser | `CORS_ORIGINS` must include your frontend origin (e.g. `http://localhost:3000`). In development, defaults often suffice if unset. |
| `JWT_SECRET_KEY` warnings | Use a strong secret in `.env`; production requires a non-placeholder secret. |
| Cannot log in as GFM | Group Fleet Manager flow may require OTP email; configure **Resend** or use non-GFM test paths. |

Further deployment notes live under `on-prem-handoff/` and cloud-oriented docs in the repo root.

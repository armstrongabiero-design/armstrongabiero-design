# Service Flow — End-to-End Request Processing

## Brief description

User interactions are handled by the React SPA in the browser. Data mutations and reads go to the FastAPI backend over JSON/HTTPS. The backend authenticates requests with JWTs, enforces role-based access and country scope, executes business logic, reads/writes MongoDB, and may call external services (AI, FX, object storage, email). Responses flow back as JSON to the frontend; file uploads may stream to object storage.

## Typical authenticated API request

```
User action (browser)
    → React SPA (axios) HTTP request to https://<api-host>/api/...
    → (TLS) Load balancer / reverse proxy
    → Uvicorn worker → FastAPI
    → Optional: extract Bearer JWT from Authorization header
    → Verify JWT signature and expiry; load user role / country claims
    → Route to endpoint handler
    → Authorization: RBAC + country-scoped data rules
    → Business logic (validation, domain rules)
    → Database: Motor/PyMongo queries to MongoDB (read/write as needed)
    → Optional side effects:
         • Presign or proxy upload to S3-compatible storage
         • Call Google Gemini / Hugging Face for AI features
         • Fetch or cache FX rates
         • Send email via **Resend API** for notifications
    → JSON response (or file/stream for downloads)
    → Proxy → Browser → React updates UI
```

## Authentication-specific flows

**Login**

1. `POST /api/auth/login` with credentials  
2. Backend validates password (bcrypt), issues signed JWT  
3. Frontend stores token (e.g. memory/localStorage per implementation) and attaches `Authorization: Bearer <token>` on subsequent calls  

**Password reset**

1. User requests reset → backend generates token, sends email via Resend (requires outbound **HTTPS** to Resend)  
2. User submits new password → backend validates token, updates hash, invalidates reset token  

**Session / me**

- `GET /api/auth/me` returns current profile when JWT is valid.

## Document upload (illustrative)

1. User selects file in UI  
2. Frontend calls backend upload endpoint (e.g. `POST /api/documents/upload`)  
3. Backend validates auth, size/type, stores file in object storage, persists metadata (URLs, expiry, entity link) in MongoDB  
4. Response confirms success; UI refreshes lists or detail views  

## AI-heavy endpoints

- Requests still enter through the same API path after JWT verification.  
- Backend calls external HTTPS APIs (Gemini, Hugging Face); latency is **higher** (often **2–5+ seconds** per project guidance), so timeouts and client UX should allow for slower responses on those routes.

## What does *not* run in-line today

- **No mandatory WebSocket** path in current scope (real-time GPS noted as integration-ready, not a hard dependency in the baseline description).  
- **No separate message-queue consumers** documented as required for core CRUD; batch/background behavior should be confirmed from `server.py` if schedulers are added.

## Related documents

- Architecture: [01-architecture.md](01-architecture.md)  
- External dependencies: [09-additional-considerations.md](09-additional-considerations.md)

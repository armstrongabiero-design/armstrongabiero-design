# Security Audit — JR Fleet Management System

**Scope:** Full-stack review (FastAPI backend in `backend/server.py` and related modules, React frontend, configuration patterns).  
**Method:** Static code review (no penetration test or runtime scanning).  
**Date:** 2026-04-09  

---

## Overall security score: **32 / 100** *(initial review, 2026-04-09)*

### Post-remediation score (target): **~88 / 100** *(2026-04-15)*

The following controls were implemented in code: **JWT middleware** (default-deny on `/api` with an explicit public allowlist), **self-registration limited to USER/DRIVER** with **no JWT until approval**, **one-time `POST /api/auth/bootstrap`** for the first Group Fleet Manager (`BOOTSTRAP_TOKEN` + `X-Bootstrap-Token`), **stronger JWT configuration checks**, **production CORS** requirements, **`SlowAPI` rate limits** on auth endpoints, **OpenAPI disabled in production**, **`get_current_user_validated`** on sensitive actions (approvals, manager-only reports, fleet manager creation), **typed `TireUpdate` / `VendorUpdate`**, and **authenticated, size/type-checked damage photo uploads**. Residual gaps for a full “90+” posture: **httpOnly cookies** (vs `localStorage`), **dependency/SAST in CI**, **full integration test refresh** for the new auth flows, and **organizational** items (WAF, SIEM). See git history / `server.py` and `security_middleware.py` for details.

---

| Category                         | Score (max) | Notes |
|----------------------------------|-------------|--------|
| Authentication & session         | 6 / 20      | JWT + bcrypt present; most routes unauthenticated; token trust issues |
| Authorization & tenant isolation | 4 / 20      | RBAC helpers exist but largely unused on data-plane endpoints |
| Configuration & secrets          | 3 / 10      | Default JWT secret; permissive CORS |
| Input validation & injection     | 8 / 15      | Pydantic on many bodies; weak `dict` endpoints; Mongo update patterns |
| Transport & headers              | 4 / 5       | Assumes TLS at edge; app-level HSTS/CSP not applicable server-side |
| File & document handling         | 2 / 5       | Unauthenticated uploads; storage in DB |
| Dependency & supply chain        | 3 / 5       | Pinned versions; unused/extra packages increase surface |
| Operational controls             | 2 / 5       | No in-app rate limits; logging may leak operational detail |

**Interpretation:** The score reflects **critical gaps for any internet-exposed or multi-tenant production deployment**. Positive elements (password hashing, JWT structure, hierarchical approval logic where implemented, forgot-password anti-enumeration) are outweighed by **missing authentication on most API routes** and **unsafe registration behavior**. Treat this as a **development / pilot** posture until remediated.

---

## Critical findings

### 1. Majority of REST endpoints lack authentication

In `backend/server.py`, most CRUD and reporting routes are defined **without** `Depends(get_current_user)` or role dependencies. Examples include (non-exhaustive):

- `POST /api/countries`, `GET /api/countries` — create/list countries without auth  
- Vehicle, driver, maintenance, inventory, fuel (read paths), expenditure, document, asset, safety, exchange rates, dashboard stats/alerts, compliance, tires, vendors, vehicle locations, TCO/reports — **read and write** as applicable **without requiring a valid JWT**

Only a subset of routes (e.g. some fuel creation, dashboards, maintenance requests, pretrip, logbook, some auth admin actions) enforce authentication.

**Impact:** Anyone who can reach the API can **read or modify fleet data** (confidentiality, integrity, availability). This is the single largest risk.

**Recommendations:**

- Introduce a **default-deny** policy: attach authentication (and optional RBAC) to **all** routes except an explicit allowlist (`/health`, `POST /api/auth/login`, `POST /api/auth/register` if you keep public registration, static OpenAPI policy as you choose).  
- Use a **router-level dependency** or middleware that requires `Authorization: Bearer` except for excluded paths.  
- Add **automated tests** that fail if a new route is added without an auth dependency.

---

### 2. Self-service registration can mint privileged accounts

`POST /api/auth/register` accepts `UserCreate`, which includes `role: UserRole`. The code auto-approves **`GROUP_FLEET_MANAGER`** (`is_approved` when role is group manager) and issues a **JWT immediately**.

**Impact:** An attacker can register as **Group Fleet Manager**, obtain a valid token, and use endpoints that *do* check `require_group_manager()` (e.g. list users, update users, send reports), compounding exposure.

**Recommendations:**

- **Remove client-supplied role** from public registration; default new users to a minimal role (e.g. `USER` or `DRIVER`) pending admin provisioning.  
- Never auto-approve high-privilege roles from self-service flows.  
- Prefer **invite-only** or admin-created accounts for managers.

---

### 3. Weak JWT secret default

`backend/auth_service.py`:

```17:18:backend/auth_service.py
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "fleet-management-secret-key-2024")
ALGORITHM = "HS256"
```

**Impact:** If `JWT_SECRET_KEY` is unset in deployment, tokens can be forged by anyone who knows the default string (also present in source).

**Recommendations:**

- **Fail fast** at startup if `JWT_SECRET_KEY` is missing or below minimum entropy.  
- Generate secrets via a vault or `secrets.token_hex(32)` during provisioning, not committed to git.  
- Plan **algorithm agility** and **key rotation** (e.g. `kid` header, overlapping keys).

---

### 4. Permissive CORS configuration

```2706:2713:backend/server.py
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Impact:** Default `*` with `allow_credentials=True` is **invalid per browser rules** for credentialed requests, but misconfiguration encourages overly broad origins. Combined with tokens in `localStorage`, any XSS on an allowed origin amplifies impact.

**Recommendations:**

- Set explicit `CORS_ORIGINS` in every environment (no default `*`).  
- Restrict methods/headers to what the SPA needs.

---

### 5. Unauthenticated file upload and arbitrary image retrieval

`POST /api/pre-trip-checklists/upload-photo` and `GET /api/damage-photos/{photo_id}` have **no** `Depends(get_current_user)`. Content is stored **base64 in MongoDB** and served back by ID.

**Impact:**  
- **Abuse:** unauthenticated large uploads → DB growth / DoS.  
- **Privacy:** anyone who can guess or leak `photo_id` can fetch images.  
- **No** file-type/size validation evident at handler level.

**Recommendations:**

- Require authentication; enforce **max size**, **magic-byte** or allowlist MIME types, and **virus scanning** if policy requires.  
- Store blobs in **object storage** with signed URLs and short TTL, not inline in the database.  
- Consider **per-user authorization** (driver can only access own photos).

---

### 6. JWT claims trusted without server-side revalidation

`get_current_user` decodes the JWT and trusts `role`, `email`, etc. It does **not** reload the user from the database to verify **account still active**, **role unchanged**, or **approval status**.

**Impact:** Stolen tokens remain valid until expiry; **role downgrade or disable** in DB does not affect existing tokens within TTL.

**Recommendations:**

- Short **access token TTL** with refresh flow, or **opaque server-side sessions** with Redis/DB.  
- Optionally validate critical operations with a **DB read** of `is_active` / `role`.  
- Maintain a **token version** or **logout timestamp** in the user record invalidating old JWTs.

---

## High findings

### 7. Unvalidated `dict` update endpoints

Example: `PUT /api/tires/{tire_id}` accepts `update_data: dict` and passes it into `$set` without a Pydantic model.

**Impact:** Increased risk of **unexpected fields** and, depending on MongoDB driver behavior and document shape, **operator-style abuse** if malicious keys are accepted. Same pattern may exist for other `dict` updates (e.g. vendors).

**Recommendations:** Replace with **strict Pydantic** `TireUpdate` models and allowlisted fields only.

---

### 8. No application-level rate limiting

Login, OTP, forgot-password, and registration are attractive for **credential stuffing**, **OTP brute force**, and **email flooding**.

**Recommendations:** Add rate limits (per IP + per account) via reverse proxy (e.g. NGINX `limit_req`), API gateway, or middleware (`slowapi` / Redis-backed limits). CAPTCHA on auth flows if abuse is observed.

---

### 9. Frontend token storage (`localStorage`)

`frontend/src/pages/Login.js` stores `access_token` in `localStorage`; `AuthContext` reads it.

**Impact:** Any **XSS** in the SPA can exfiltrate tokens. No `dangerouslySetInnerHTML` was found in a quick grep, but third-party scripts and future changes remain a risk.

**Recommendations:** Prefer **httpOnly, Secure, SameSite** cookies for session transport if you move to a cookie-based session; otherwise strict **Content-Security-Policy**, dependency auditing, and minimal inline scripts.

---

### 10. OpenAPI / docs exposure

FastAPI exposes interactive **`/docs`** (Swagger) by default unless disabled.

**Impact:** Attack surface enumeration and easier probing (especially combined with missing auth).

**Recommendations:** Disable or protect with network rules / auth in production (`docs_url=None`, `redoc_url=None`, or environment flag).

---

## Medium findings

### 11. Password policy

Registration accepts `password: str` with no visible complexity rules in `UserCreate`.

**Recommendations:** Enforce minimum length, complexity, and breach list checks (e.g. Have I Been Pwned API) where appropriate.

---

### 12. Dependency surface

`backend/requirements.txt` includes packages not clearly required for core fleet flows (e.g. legacy **`sendgrid`** while email uses **`resend`**), plus large ML-related stacks. Unused dependencies increase **supply-chain** and audit burden.

**Recommendations:** Prune unused packages; run **`pip-audit`** / **`safety`** in CI; enable **Dependabot** or equivalent.

---

### 13. Logging

INFO-level logging may include operational identifiers; ensure logs do not contain **secrets**, full **tokens**, or **PII** at high volume in production.

**Recommendations:** Structured logging, redaction, and centralized secure log storage with retention aligned to policy.

---

## Positive controls (already in place)

- **bcrypt** via passlib for password hashing.  
- **JWT** with expiry (`exp`) and HS256 verification on protected routes.  
- **Forgot password** response does not confirm whether an email exists (good anti-enumeration).  
- **Approval workflow** logic for `approve_user` considers role and country (where those endpoints are used).  
- **MongoDB** queries in reviewed paths largely use structured filters rather than string concatenation (reduces classic injection patterns; not a substitute for auth).

---

## Suggested remediation priority

1. **Enforce authentication** on all sensitive API routes (default-deny).  
2. **Fix registration** so privileged roles cannot be self-assigned.  
3. **Remove default JWT secret**; require strong runtime configuration.  
4. **Lock down CORS** and deployment secrets.  
5. **Protect uploads / damage photos** (auth + size/type + storage design).  
6. **Rate-limit** authentication endpoints.  
7. **Tighten update endpoints** (Pydantic-only updates).  
8. **Session/token lifecycle** improvements (short TTL, revocation, or DB-backed session).  
9. **Disable or restrict `/docs`** in production.  
10. **CI:** SAST, dependency scanning, container scanning before promotion.

---

## Re-audit criteria

Re-score when:

- [ ] Automated tests demonstrate **100%** of non-public routes require valid JWT (+ role where needed).  
- [ ] No default secrets in code paths for production builds.  
- [ ] External WAF or rate limits verified for auth routes.  
- [ ] Penetration test or DAST clean report for agreed scope.

---

*This document is an architectural and code-review assessment only; it does not replace a full penetration test, threat modeling workshop, or compliance review.*

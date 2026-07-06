# Production domain — `https://fleet.gtiholding.com`

This is the **canonical public URL** for GTI Fleet Solutions in production. All env vars, TLS, DNS, and frontend builds must stay aligned with it.

## Recommended layout (single host)

| What | URL |
|------|-----|
| Web app (React) | `https://fleet.gtiholding.com/` |
| API (FastAPI, via Nginx) | `https://fleet.gtiholding.com/api/...` |
| Admin bootstrap UI | `https://fleet.gtiholding.com/admin-register` |
| Password reset links | `https://fleet.gtiholding.com/reset-password?token=...` |

Nginx terminates TLS and proxies `/api` to `127.0.0.1:8000`. The React build must use the **same origin** for API calls:

```bash
export REACT_APP_BACKEND_URL="https://fleet.gtiholding.com"
```

## Environment triple (must match)

Set these on the app server (`backend/.env`) and rebuild the frontend whenever the public URL changes:

| Variable | Production value |
|----------|------------------|
| `CORS_ORIGINS` | `https://fleet.gtiholding.com` |
| `FRONTEND_URL` | `https://fleet.gtiholding.com` |
| `REACT_APP_BACKEND_URL` (build-time) | `https://fleet.gtiholding.com` |

Rules:

- **Same scheme and host** as the address users type in the browser (`https://fleet.gtiholding.com`).
- **No trailing slash** on these values.
- **Do not** put `/api` in `CORS_ORIGINS` or `FRONTEND_URL` (CORS origin is the site origin, not the API path).

## DNS and TLS

1. **DNS:** `fleet.gtiholding.com` → public IP of the app server (or your load balancer in front of `192.168.135.21`).
2. **Certificate:** Issue for `fleet.gtiholding.com` (Let’s Encrypt or corporate CA). Update Nginx `server_name` and run Certbot against this name (see [`PRODUCTION_DEPLOYMENT_RUNBOOK.md`](PRODUCTION_DEPLOYMENT_RUNBOOK.md)).
3. **Internal access:** Until DNS is public, you can test with `/etc/hosts` pointing `fleet.gtiholding.com` at `192.168.135.21` (Phase 1 HTTP) before enabling HTTPS.

## What to take note of after the domain change

### 1. Rebuild the frontend

`REACT_APP_BACKEND_URL` is **baked in at `npm run build`**. Changing `backend/.env` alone is not enough — rebuild and redeploy `frontend/build` to `/var/www/fleet`.

### 2. Restart the API

After updating `CORS_ORIGINS` and `FRONTEND_URL`:

```bash
sudo systemctl restart fleet-api
```

### 3. CORS and login

If the UI loads but API calls fail with CORS errors, `CORS_ORIGINS` does not exactly match the browser origin (check `http` vs `https`, typos, or an old IP-based origin).

### 4. Email (Resend)

Password-reset and notification links use `FRONTEND_URL`. Update it to `https://fleet.gtiholding.com`.

**Sender domain:** If you still use `noreply@alerts.jrfleetsolutions.com`, that can work as long as Resend still verifies that domain. For a consistent brand, add and verify a **`gtiholding.com`** (or subdomain) sender in Resend and set `SENDER_EMAIL` accordingly.

### 5. Cookies and HTTPS

Production should be **HTTPS-only** (redirect HTTP → HTTPS). JWT and session behaviour assume a stable origin; mixed `http://192.168.135.21` and `https://fleet.gtiholding.com` during cutover will look like two different apps to the browser.

### 6. Group Fleet Manager OTP

GFM login may require email OTP. Ensure outbound mail works and testers use the **production URL** in bookmarks, not the old hostname.

### 7. Bookmarks and integrations

Replace any references to `gti.jrfleetsolutions.com`, raw IP URLs, or `localhost` in runbooks, monitoring, and status checks with `https://fleet.gtiholding.com`.

### 8. Smoke checks

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://fleet.gtiholding.com/
curl -sS https://fleet.gtiholding.com/api/health
# or your documented health route
```

### 9. UAT vs production

Use a **different hostname** for UAT (e.g. `uat-fleet.gtiholding.com` or internal-only DNS), not the same `fleet.gtiholding.com` with a different backend — avoids wrong `MONGO_URL` and secrets.

## Local development (unchanged)

Developers keep:

- `REACT_APP_BACKEND_URL=http://127.0.0.1:8000` (or `http://localhost:8000`)
- `CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`
- `FRONTEND_URL=http://localhost:3000`

Do not point local `.env` at production unless you intend to hit the live API (and production CORS allows your dev origin).

## Related docs

- [`PRODUCTION_DEPLOYMENT_RUNBOOK.md`](PRODUCTION_DEPLOYMENT_RUNBOOK.md) — Nginx, Certbot, Phase 1/2 cutover
- [`DC_DEPLOYMENT_GUIDE.md`](DC_DEPLOYMENT_GUIDE.md) — four-server topology
- [`../deployment-brief.md`](../deployment-brief.md) — deployment overview
- [`../CLAUDE.md`](../CLAUDE.md) — assistant / server context

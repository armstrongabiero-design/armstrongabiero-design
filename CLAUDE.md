# Deployment context — GTI Fleet Solutions (armstrongabiero-design)

This file is the **source of truth for assistants** working on **data-centre / production deployment**. It reflects **what is actually on the servers** (verified inventory, May 2026), not generic Ubuntu assumptions.

---

## 1. Purpose

- Keep deployment advice **consistent** with **CentOS Stream 9** and the **three-server** layout below.
- **Do not** assume `apt`, **UFW**, or Ubuntu paths unless the doc explicitly says otherwise.
- Prefer **`dnf` / `firewalld` / `systemd`** on these hosts.

---

## 2. Verified server profile (all three machines match)

Inventory was taken from the application host **192.168.135.21**; **all servers are the same** hardware/OS profile.

| Attribute | Value |
|-----------|--------|
| **OS** | **CentOS Stream 9** (`platform:el9`) |
| **Kernel** | Linux 5.14.x **el9** x86_64 |
| **Virtualisation** | VMware |
| **vCPU** | 4 |
| **RAM** | ~15 GiB |
| **Disk** | ~100 GiB **LVM**: `/` ≈ 61 GiB XFS (`cs-root`), `/home` ≈ 30 GiB XFS (`cs-home`), swap ≈ 8 GiB |
| **Primary NIC** | `ens33` |
| **Default gateway** | `192.168.135.254` |
| **LAN** | `192.168.135.0/24` |

### 2.1 Host IPs and roles (production target)

| IP | Role |
|----|------|
| **192.168.135.21** | **Application**: Nginx + React static + FastAPI (Gunicorn/Uvicorn); **MongoDB arbiter** (e.g. port `27018`) |
| **192.168.135.22** | **MongoDB data node** (`mongod`, port `27017`) |
| **192.168.135.23** | **MongoDB data node** (`mongod`, port `27017`) |

Replica set name (planned): **`rs0`** — two data-bearing members + one arbiter on `.21`.

---

## 3. What is actually installed today (greenfield on app server)

These facts avoid “already deployed” assumptions:

| Component | State on surveyed host |
|-----------|-------------------------|
| **`/opt/fleet`, `/var/www/fleet`** | **Absent** — application not deployed yet |
| **`fleet-api` systemd unit** | **Not present** |
| **`mongod`** | **Not installed** |
| **`nginx`** | **Not installed** (install via `dnf` **with sudo**; interactive installs failed when sudo auth did not complete) |
| **`python3`** | **Present** — `/usr/bin/python3`, **Python 3.9.25** |
| **`pip3`** | May be missing until `python3-pip` is installed via `dnf` |
| **`node` / `npm`** | **Not available** until `nodejs` (or NodeSource Node 20+) is installed |
| **Docker** | **Not present** (optional; Podman is typical on RHEL-family) |

---

## 4. Users and privilege model

- Deploy/runtime user **`fleet`** exists (`uid` 1001), **`wheel`** group, **`/bin/bash`**.
- **`sudo` is not passwordless** (`sudo -n` does not succeed without cached credentials). Any install/runbook must either:
  - use an interactive `sudo` session, or
  - run initial provisioning as **root** over SSH, or
  - configure **passwordless sudo** for `fleet` only for approved commands (org policy).

---

## 5. Networking and firewall (do not assume UFW)

- **`ufw`** is **not** in use (`ufw not installed or inactive`).
- **Firewall**: **`firewalld`** with **nftables** backend (`nft list ruleset` shows `firewalld`).
- **iptables** filter chains shown as empty ACCEPT; effective rules live under **nft** / firewalld zones.

When documenting ports, use **`firewall-cmd`** (persistent zones/services), not `ufw allow`.

---

## 6. Listening services observed (192.168.135.21)

Useful for security review and **not** mistaking the box for a minimal server:

| Port | Notes |
|------|--------|
| **22/tcp** | `sshd` — all interfaces |
| **631/tcp** | **CUPS** — localhost only |
| **9090/tcp** | **Cockpit** (`systemd`) — **all interfaces**; restrict or disable in hardening if not required |

There is **no** Nginx / MongoDB / app listener yet.

---

## 7. Time and DNS

- **chronyd** active; clock synchronised.
- Time zone on surveyed host: **America/New_York** — align application logs and cron expectations with **your** operational TZ if different.
- **`/etc/resolv.conf`**: internal resolver **10.110.11.3** + **8.8.8.8**.

---

## 8. Hostname hygiene

- **`hostnamectl`** showed **static hostname unset**, transient **`localhost`**. **Set persistent hostnames** per server (e.g. `fleet-app-01`, `fleet-db-01`, `fleet-db-02`) and **`/etc/hosts`** or internal DNS so MongoDB replica set members are stable.

---

## 9. Stack constraints (this repo)

- **Backend**: FastAPI, entry **`server:app`** (`backend/server.py`), env from **`backend/.env`** (see **`backend/.env.example`**). Requires **`MONGO_URL`**, **`JWT_SECRET_KEY`**, **`DB_NAME`**, production **`ENVIRONMENT`**, **`CORS_ORIGINS`**, **`FRONTEND_URL`**, optional **Resend** (`RESEND_API_KEY`, `SENDER_EMAIL`).
- **Frontend**: React (Craco), **`REACT_APP_BACKEND_URL`** baked at **build time** — must match the **browser-visible** API URL (same-origin via Nginx `/api` proxy is recommended).
- **Production public URL**: **`https://fleet.gtiholding.com`** — set **`CORS_ORIGINS`**, **`FRONTEND_URL`**, and **`REACT_APP_BACKEND_URL`** to that origin (no trailing slash). See **`docs/PRODUCTION_DOMAIN.md`**.
- **Database**: MongoDB (Motor/PyMongo). **Python 3.9.25** on servers is acceptable if dependencies support it; if not, use **`python3.11`/`python3.12` modules** or **pyenv**—document the chosen path in the runbook.

---

## 10. Documentation map (repo)

| Document | Purpose |
|----------|---------|
| [`docs/DC_DEPLOYMENT_GUIDE.md`](docs/DC_DEPLOYMENT_GUIDE.md) | DC topology (1 UAT + 3 prod option; concepts); links to CentOS runbook |
| [`docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`](docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md) | Step-by-step install for **CentOS Stream 9** (`dnf`, MongoDB RPM repo, **firewalld**, **SELinux**, RHEL Nginx) |
| [`docs/PRODUCTION_DOMAIN.md`](docs/PRODUCTION_DOMAIN.md) | **`fleet.gtiholding.com`** — DNS/TLS, env triple, rebuild/restart, cutover notes |
| [`docs/PRODUCTION_UPDATE.md`](docs/PRODUCTION_UPDATE.md) | **Push → pull → redeploy** on fleet-app-01 (backend restart, frontend build, rsync) |

When changing the stack, update **this file** and the runbook together.

---

## 11. Assistant rules (consistency checklist)

1. **OS**: CentOS Stream 9 → **`dnf`**, **`systemctl`**, **`firewall-cmd`**, SELinux-aware paths for Nginx (`httpd_can_network_connect` if proxying to backend).
2. **No UFW** on these servers unless the team explicitly migrates.
3. **Three-server split**: MongoDB on **.22/.23**; app + arbiter on **.21** — do not collapse DB onto the app server in production without editing the architecture docs.
4. **Secrets**: never commit; `.env` permissions `600`, owned by `fleet` where applicable.
5. **Package installs**: never rely on **interactive** `command-not-found` / `dnf` prompts in scripts; use explicit **`sudo dnf install -y ...`** in documented steps after authentication is resolved.
6. **Node version**: Prefer **Node 20 LTS** for building the React app (CRA/Craco compatibility); avoid relying on default EL9 **`nodejs` 16** unless CI proves the build works.

---

## 12. Change log

| Date | Change |
|------|--------|
| 2026-05-10 | Initial `CLAUDE.md` from live inventory (CentOS Stream 9 @ 192.168.135.21, identical cluster); greenfield app/Mongo/Nginx. |
| 2026-05-10 | `PRODUCTION_DEPLOYMENT_RUNBOOK.md` aligned to CentOS Stream 9 (`dnf`, firewalld, SELinux). |

# Operating System Versions — Hosting Guidance

## Brief description

The application stack is **Linux-first** for the backend and database. The **frontend build** also runs on Linux or macOS/Windows build agents; production serving is static files only (no Node runtime required on the serving path unless you choose SSR, which this project does not use).

## Recommended (production / on-prem)

| Role | Recommended | Notes |
|------|-------------|--------|
| **API servers** | **Ubuntu Server 22.04 LTS** or **RHEL 8/9** (or compatible Enterprise Linux) | Long-term support, common for Python + container runtimes |
| **Database servers** | Same family as API, or vendor-approved MongoDB image/OS matrix | Follow MongoDB Inc. or your DocumentDB-compatible vendor’s supported OS list |
| **Reverse proxy / LB** | Ubuntu 22.04 LTS, RHEL, or dedicated appliance (F5, etc.) | NGINX/HAProxy widely used |

## Supported (acceptable alternatives)

- **Ubuntu 20.04 LTS** — acceptable if already standardized; plan migration before 20.04 EOL in your policy.  
- **Debian 11/12** — acceptable for application and proxy tiers if hardened to org standards.  
- **Windows Server** — **not required** for runtime: the backend is Python on Linux containers or Linux VMs. Windows may be used only as **admin workstations** or **CI build agents** if desired; production API/DB should remain Linux for consistency with dependencies and ops tooling.

## Container host OS

If deploying via **Docker/Podman/Kubernetes**, use a **CNCF-aligned host**: Ubuntu 22.04+, RHEL/CentOS Stream/Rocky as per your Kubernetes distribution.

## Client (browser)

- SPA targets modern evergreen browsers (Chrome, Firefox, Safari per `frontend` browserslist-style constraints). No server-side OS dependency for end users beyond HTTPS access.

## Action for infrastructure team

Confirm alignment with your **security baseline** (CIS hardening, patching cadence). The application does not impose exotic kernel modules; standard server images are sufficient.

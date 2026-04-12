# Network Ports to Enable

## Brief description

Below is a **checklist of ports** commonly needed for the JR Fleet Management System on-prem. Adjust if your **standard ports** differ (e.g. MongoDB behind SSH tunnel only — then only admins use 22).

## Inbound (to your published services)

| Port(s) | Protocol | Service | Typical source | Notes |
|---------|----------|---------|----------------|-------|
| **443** | TCP | HTTPS — frontend static site & API (via LB/proxy) | User networks, internet, or ZTNA | Primary user access |
| **80** | TCP | HTTP | Same | Often redirect to 443 only |
| **8000** | TCP | Uvicorn / FastAPI **direct** | Usually **none** from internet | Only if debugging; normally LB → 8000 **internal** only |

## Internal only (application tier ↔ data tier)

| Port(s) | Protocol | Service | From | To |
|---------|----------|---------|------|-----|
| **27017** | TCP | MongoDB / DocumentDB-compatible | API servers | Database cluster |
| **443** or **9000**/vendor | TCP | S3-compatible API | API servers | Object storage (MinIO often 9000/9001) |

*Use vendor documentation for MinIO/CEPH RGW etc.; many enterprises expose S3 on 443 behind a reverse proxy.*

## Administrative access

| Port(s) | Protocol | Service | Notes |
|---------|----------|---------|-------|
| **22** | TCP | SSH | Bastion pattern; restrict by IP/source |
| **3389** | TCP | RDP | Only if Windows admin hosts |

## Outbound from API / app subnet (allowlist)

| Port(s) | Protocol | Destination | Purpose |
|---------|----------|-------------|---------|
| **443** | TCP | `*.googleapis.com`, Google AI endpoints, Hugging Face, forex providers | AI and FX |
| **443** | TCP | Object storage endpoint | If S3 API is HTTPS |
| **443** | TCP | `api.resend.com` | Transactional email (**Resend** — primary path for this application) |
| **587** / **465** (optional) | TCP | Corporate SMTP | Only if you add a different mail provider or relay later |
| **53** | UDP/TCP | Corporate DNS resolvers | Name resolution |

## Clients (browser)

- No inbound ports opened on user PCs; users only **initiate outbound 443** to your front door.

## Firewalls and documentation

1. Attach this matrix to your **firewall change request** with resolved FQDNs where possible (some teams require IP lists for Google — use published ranges or outbound proxy).  
2. Confirm **MongoDB** is **not** published to `0.0.0.0/0`.  
3. If **ICMP** is blocked, ensure **path MTU** issues are still debuggable per your NOC policy.

## Related

- Network design context: [07-network-requirements.md](07-network-requirements.md)

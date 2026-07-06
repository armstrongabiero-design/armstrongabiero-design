# Network Requirements

## Brief description

The fleet platform needs **reliable HTTPS** from users to the **frontend** and **API**, **private connectivity** from API to **MongoDB** and **object storage**, and **controlled outbound HTTPS** to **third-party APIs** and **email**. DNS and TLS certificates are required for production-style deployments.

## User and administrative access


| Path                      | Requirement                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Internal users**        | Reach SPA and API via **corporate network** and/or **internet** depending on policy; often **HTTPS** to a corporate hostname |
| **Branch / mobile users** | Same as above; ensure latency acceptable to West African users if primary population is there                                |
| **Administrators**        | **SSH** or **bastion** to Linux hosts (or kubectl to cluster) per org policy — not for end users                             |


## Segmentation

- **DMZ / edge:** reverse proxy or load balancer with public or controlled ingress  
- **Application tier:** private subnets; **no direct inbound from internet** except via load balancer  
- **Data tier:** private network only; MongoDB not exposed to public internet  
- **Object storage:** S3-compatible endpoint on internal network or via VPC-style routing

## DNS and TLS

- **Production hostname:** `fleet.gtiholding.com` (UI + `/api` on one host; see `docs/PRODUCTION_DOMAIN.md`). Use a separate UAT hostname if needed — adjust for on-prem **internal DNS** or **split-horizon**  
- **TLS certificates** on proxy/LB; **TLS everywhere** between tiers where supported (especially DB and S3 TLS)

## Load balancing

- **Recommended** for API: active/active HTTP(S) load balancing across multiple Uvicorn instances  
- **Sticky sessions** not required for API (stateless JWT)  
- **Idle timeouts:** allow **60+ seconds** for slower AI endpoints; JSON APIs typically fine with defaults

## Outbound (egress)

The **API servers** must reach:


| Destination                 | Protocol                                           | Purpose                          |
| --------------------------- | -------------------------------------------------- | -------------------------------- |
| Google Gemini / Google APIs | HTTPS (443)                                        | AI features                      |
| Hugging Face                | HTTPS (443)                                        | Model endpoints                  |
| Forex / rate providers      | HTTPS (443)                                        | Currency conversion              |
| Resend API                  | HTTPS (**443**) to `api.resend.com`                | Transactional email (password reset, notifications, reports) |
| Object storage              | HTTPS (443) or HTTP if internal only (discouraged) | Document store                   |


If your policy is **deny-all egress**, provide an **egress allowlist** or **forward proxy** with TLS inspection exceptions as required.

## Hybrid / cloud burst

If some services remain in cloud (e.g. **Resend**, **S3**): ensure **stable routes**, **no hairpin NAT issues**, and **credential rotation** paths.

## VPN / Zero Trust

- **Site-to-site VPN** or **SD-WAN** if users or integrations are on private partner networks  
- **Zero-trust** client access compatible with HTTPS apps — no special protocol beyond organizational ZTNA vendor requirements

## High availability (future)

- Multiple API nodes across failure domains  
- DB replica set / multi-node cluster for production  
- Document in DR plan after RPO/RTO workshop

## Related

- Concrete port list: [08-network-ports.md](08-network-ports.md)


# Additional Considerations for On-Prem / Hybrid Deployment

## Brief description

Beyond compute and network, this platform depends on **third-party SaaS APIs**, **secrets management**, **object storage**, **email (Resend)**, and **operational practices** (backups, monitoring). On-prem migration usually means replacing **AWS S3** with on-prem S3-compatible storage while **email stays on Resend** (HTTPS from the API tier) unless you reimplement `email_service.py` for SMTP.

## Third-party APIs and licensing


| Dependency           | Role                                   | On-prem implication                                                                                                         |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Google Gemini**    | Predictive maintenance and AI insights | Requires **outbound internet** (or allowed paths); **API keys** and quota; review **data residency** if prompts include PII |
| **Hugging Face**     | ML model access                        | Outbound HTTPS; **token** management                                                                                        |
| **Forex / currency** | Rates via `forex-python`               | Outbound access; **fallback static rates** exist in schema docs if API fails                                                |


## Object storage

- Application expects **S3-compatible** semantics (bucket, ACL/IAM-style access in cloud implementations).  
- **On-prem options:** MinIO, Dell ECS, NetApp StorageGRID, etc.  
- **Hybrid:** keep AWS S3 — then stable egress and IAM keys from on-prem API subnet.

## Email

- The codebase uses **Resend** (`backend/email_service.py`): **`RESEND_API_KEY`** and **`SENDER_EMAIL`** (verified domain in Resend).  
- **Network:** allow outbound **HTTPS** to Resend’s API (see [08-network-ports.md](08-network-ports.md)).  
- **Hybrid/on-prem:** no change required to mail plumbing if API servers have internet egress; otherwise you would need an alternative provider and code changes.

## Secrets and configuration

- **JWT secret**, DB passwords, cloud keys, Gemini/HF tokens — store in vault (HashiCorp Vault, CyberArk, cloud secrets manager if hybrid).  
- Rotate credentials on a defined schedule.

## CORS

- Frontend origin must be **whitelisted** in FastAPI CORS middleware; document exact production URLs for infra handoff.

## Background work and scheduling

- Core flows are **request-driven**. If product adds **scheduled jobs** (reports, rate sync, cleanup), you may need **cron**, **Kubernetes CronJob**, or a **worker queue** — confirm against current `server.py` deployment.  
- **No Redis required** for pilot per system description; production may introduce caching later.

## File upload limits

- Document uploads: **~10 MB per file** noted in system description — enforce at **proxy and app** layer.

## Compliance and data residency

- Multi-country operations (Ghana, Liberia, São Tomé and Príncipe): clarify **where primary DB and files live** and whether regulators require **in-country** or **EU/AO** hosting.  
- **GDPR**-style obligations mentioned in system description for user data.

## Monitoring and logging

- Minimum: **API latency/error rate**, **DB health**, **disk space**, **external API failures**.  
- Pilot log retention was short (e.g. **3–7 days** app logs in cloud doc); production may require longer retention per policy.

## Disaster recovery

- Pilot may accept **single-node DB**; production should define **backup frequency**, **restore tests**, and **RPO/RTO**.

## Drift between docs

- `DATABASE_SCHEMA.md` references some **OpenAI**-worded AI examples in commentary; **implemented dependencies** in `requirements.txt` center on **Google** stack — treat **codebase + requirements.txt** as source of truth for provisioning API access.

## Documents in this handoff

- [01-architecture.md](01-architecture.md) through [08-network-ports.md](08-network-ports.md)  
- Master narrative: `SYSTEM_DESCRIPTION_FOR_CLOUD_ENGINEERS.txt`  
- Schema: `DATABASE_SCHEMA.md`


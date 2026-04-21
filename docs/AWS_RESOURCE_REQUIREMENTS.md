# AWS Resource Requirements - JR Fleet Management System

**Environment:** Production  
**Region:** us-east-1  
**Estimated Monthly Cost:** $736.50  
**Deployment Timeline:** 3-5 business days

---

## Infrastructure Components

### 1. Networking (VPC)
- **VPC:** 10.0.0.0/16 with DNS hostnames enabled
- **Subnets:** 3 public (10.0.1-3.0/24) + 3 private (10.0.11-13.0/24) across us-east-1a/b/c
- **Internet Gateway:** 1 for public subnets
- **NAT Gateway:** 1 with Elastic IP for private subnet internet access
- **Route Tables:** 2 (public and private with appropriate routes)

### 2. Security Groups
| Name | Inbound | Outbound |
|------|---------|----------|
| ALB-SG | HTTP/HTTPS from 0.0.0.0/0 | All to ECS-SG |
| ECS-SG | Port 8000 from ALB-SG | All (API calls) |
| DocumentDB-SG | Port 27017 from ECS-SG | None |
| Redis-SG | Port 6379 from ECS-SG | None |

---

### 3. Database - Amazon DocumentDB
- **Cluster:** Single-AZ initially (upgrade to Multi-AZ for production)
- **Instances:** 1x db.t3.medium (2 vCPU, 4 GiB) - primary only
- **Storage:** 20 GB with auto-scaling
- **Backups:** 3-day retention, daily at 03:00 UTC
- **Encryption:** At-rest (KMS) and in-transit (TLS)
- **Connection:** `mongodb://admin:pass@endpoint:27017/?ssl=true`
- **Cost Savings:** ~$360/month (db.r5.large × 2 → db.t3.medium × 1)

### 4. Cache - ElastiCache Redis
- **Type:** Single-node (upgrade to Multi-AZ for production)
- **Nodes:** 1x cache.t3.small (2 vCPU, 1.37 GiB)
- **Encryption:** At-rest and in-transit enabled
- **Auth:** Token-based (store in Secrets Manager)
- **Use:** Session management, API caching, rate limiting
- **Cost Savings:** ~$35/month (cache.t3.medium × 2 → cache.t3.small × 1)

---

## 🐳 Container & Compute Layer

### 5. Amazon Elastic Container Registry (ECR)

| Resource | Specification | Storage | Cost/Month |
|----------|--------------|---------|------------|
| **Repository** | jr-fleet-backend | ~2 GB (5-10 images) | ~$0.20 |

**Configuration:**
- Scan on push: Enabled
- Image tag mutability: Mutable
- Encryption: AES-256
- Lifecycle policy: Keep last 10 images

---

### 6. Amazon ECS (Fargate)

| Component | Specification | Quantity | Cost/Month |
|-----------|--------------|----------|------------|
| **ECS Cluster** | Fargate capacity provider | 1 | Free |
| **Task Definition** | 1 vCPU, 2 GB memory | 1 version | Free |
| **ECS Service** | Fargate launch type | 1 | Included |
| **Running Tasks** | 1 vCPU, 2 GB each | 2-10 (auto-scaling) | ~$60 (2 tasks) |

**Task Definition Specifications:**
```yaml
Family: jr-fleet-backend
Network Mode: awsvpc
Requires Compatibilities: FARGATE
CPU: 1024 (1 vCPU)
Memory: 2048 (2 GB)
Execution Role: jr-fleet-ecs-execution-role
Task Role: jr-fleet-ecs-task-role

Container Definition:
  Name: jr-fleet-backend
  Image: <ECR_REPO_URI>:latest
  Port Mappings: 8000/tcp
  Environment Variables: From Secrets Manager
  Log Driver: awslogs
  Health Check: /health endpoint every 30s
```
### 5. Container Registry - ECR
- **Repository:** jr-fleet-backend
- **Features:** Scan on push, image lifecycle (keep last 10), AES-256 encryption
- **Storage:** ~2 GB

### 6. Compute - ECS Fargate
- **Cluster:** jr-fleet-cluster with **Fargate Spot** (70% weight) + Fargate (30% weight)
- **Task Definition:** 0.5 vCPU, 1 GB memory, FastAPI on port 8000
- **Service:** 1-6 tasks (auto-scaling on 75% CPU), rolling deployments
- **Networking:** Private subnets, ECS-SG, no public IP
- **Logging:** CloudWatch Logs `/ecs/jr-fleet-backend` (7-day retention)
- **Health Check:** `/health` endpoint every 30s
- **Cost Savings:** ~$45/month (2 tasks → 1 task Spot, 1 vCPU → 0.5 vCPU)

### 7. Load Balancer - ALB
- **Type:** Application Load Balancer (internet-facing)
- **Subnets:** All 3 public subnets
- **Target Group:** IP targets on port 8000, health check `/health`
- **Listeners:** HTTP:80 (redirect to HTTPS), HTTPS:443 (forward to targets)
- **SSL Policy:** TLS 1.2+ with ACM certificate

---

### 9. CDN - CloudFront
- **Purpose:** React app delivery (US, Canada, Europe only)
- **Origin:** S3 (jr-fleet-frontend) with OAI access
- **Price Class:** PriceClass_100 (reduced coverage area)
- **Settings:** HTTPS redirect, compression, IPv6, no WAF
- **Cache TTL:** 0s (index.html) to 1 year (assets)
- **Domain:** app.jrfleetsolutions.com
- **Error Handling:** 404 → /index.html (React Router)
- **Cost Savings:** ~$30/month (regional pricing + no WAF)

### 10. DNS - Route 53

---

## 🔐 Security & Secrets Management

### 11. AWS Secrets Manager

| Secret Name | Purpose | Rotation | Cost/Month |
|-------------|---------|----------|------------|
| **jr-fleet/database** | MongoDB connection string | Manual | $0.40 |
| **jr-fleet/app-config** | API keys, JWT secret, AWS creds | Manual | $0.40 |

**Secret Structure:**

**jr-fleet/database:**
```json
{
  "MONGODB_URI": "mongodb://admin:password@endpoint:27017/fleet_db?ssl=true&replicaSet=rs0",
  "DATABASE_NAME": "fleet_management"
}
```

**jr-fleet/app-config:**
### 8. Storage - S3 Buckets
**jr-fleet-documents:**
- Purpose: User uploads, reports, documents
- Size: ~20 GB (with Intelligent-Tiering)
- Encryption (AES-256), CORS enabled, **versioning disabled initially**
- Lifecycle: Intelligent-Tiering (immediate) → Glacier (90d) → Delete (180d)

**jr-fleet-frontend:**
- Purpose: React application build files
- Size: ~2 GB (optimized builds)
- CloudFront OAI access only, **no versioning**
- Cache headers: index.html (0s), assets (1 year)
- **Cost Savings:** ~$8/month (reduced storage + lifecycle optimization)omponent | Rule Type | Action | Cost/Month |
|-----------|-----------|--------|------------|
| **Web ACL** | Managed + Custom | Block/Allow | $5 + $1 per million requests |

**Rule Configuration:**
```yaml
Web ACL Name: jr-fleet-waf
Scope: CLOUDFRONT
Region: us-east-1 (global)
Default Action: Allow

Rules (in order of priority):
  1. Rate Limiting:
     - Limit: 2000 requests per 5 minutes per IP
     - Action: Block
  
  2. AWS Managed - Common Rule Set:
     - SQL injection protection
     - XSS protection
     - Known bad inputs
     - Action: Block
  
  3. AWS Managed - Known Bad Inputs:
     - CVE patterns
     - Action: Block
  
  4. Geographic Restrictions (if needed):
     - Allow: All countries
     - Block: High-risk countries (optional)

CloudWatch Metrics: Enabled
Sampled Requests: Enabled
### 9. CDN - CloudFront
- **Purpose:** React app global delivery
- **Origin:** S3 (jr-fleet-frontend) with OAI access
- **Price Class:** PriceClass_100 (US, Canada, Europe only - not global)
- **Settings:** HTTPS redirect, compression, IPv6
- **Cache TTL:** 0s (index.html) to 1 year (assets)
- **Domain:** app.jrfleetsolutions.com
- **Error Handling:** 404 → /index.html (React Router)
- **Cost Savings:** ~$30/month (reduced coverage area + separate WAF)

### 10. DNS - Route 53
- **Hosted Zone:** jrfleetsolutions.com (1 zone)
- **Records:**
  - `app.jrfleetsolutions.com` → CloudFront (A/AAAA alias)
  - `api.jrfleetsolutions.com` → ALB (A alias)
  - Resend sending domain verification (DNS per Resend dashboard)
  - ACM validation CNAME

## 📊 Monitoring & Logging

### 15. Amazon CloudWatch

| Component | Specification | Retention | Cost/Month |
|-----------|--------------|-----------|------------|
| **Log Groups** | /ecs/jr-fleet-backend | 30 days | ~$15 (10 GB) |
| **Metrics** | Custom + AWS service metrics | N/A | ~$5 |
| **Alarms** | CPU, Memory, HTTP errors, latency | N/A | Included (first 10 free) |
| **Dashboard** | Custom monitoring dashboard | N/A | $3 per dashboard |
### 11. Secrets - AWS Secrets Manager
**jr-fleet/database:** MongoDB URI, database name  
**jr-fleet/app-config:** JWT secret, API keys (Gemini, HuggingFace, **Resend**), AWS credentials, Redis URL, `SENDER_EMAIL`

### 12. SSL - ACM Certificate
- **Domains:** *.jrfleetsolutions.com, jrfleetsolutions.com
### 14. IAM Roles
**jr-fleet-ecs-execution-role:** ECS task startup, ECR pull, Secrets Manager access  
**jr-fleet-ecs-task-role:** S3 (jr-fleet-documents), CloudWatch Logs access (email via **Resend** API + secrets, not SES)

### 19. Amazon Bedrock or SageMaker

| Service | Model | Purpose | Cost/Month |
|---------|-------|---------|------------|
| **Amazon Bedrock** | Claude 3 Sonnet | AI predictions, analysis | Variable (~$50-100) |
| **SageMaker Inference** | Custom model endpoint | Predictive maintenance | ~$200 (ml.t2.medium) |

**Current Setup:**
- Using Google Gemini API (external)
- Hugging Face models (external)

**AWS Migration Options (Future):**
```yaml
Option 1: Amazon Bedrock
  - Model: Anthropic Claude 3 Sonnet
  - Use: Maintenance predictions, report generation
  - Pricing: Pay per token (~$3/$15 per million tokens)
  - Setup: Boto3 SDK integration

Option 2: SageMaker
  - Custom model deployment
  - Real-time inference endpoint
  - Pricing: Instance-based (~$200/month for ml.t2.medium)
  - Setup: Docker image, model artifacts
```

---

## 📋 Complete Resource Summary

### Total Resource Count

| Category | Count |
|----------|-------|
| VPC Components | 11 (1 VPC, 1 IGW, 1 NAT, 6 subnets, 2 route tables) |
| Security Groups | 4 |
| Database Instances | 2 (DocumentDB primary + replica) |
| Cache Nodes | 2 (Redis primary + replica) |
| ECS Tasks | 2-10 (auto-scaling) |
| Load Balancers | 1 |
| S3 Buckets | 2 |
| CloudFront Distributions | 1 |
| Route 53 Hosted Zones | 1 |
| Secrets | 2 |
| SSL Certificates | 1 |
| IAM Roles | 2 |
| CloudWatch Log Groups | 3+ |
| CloudWatch Alarms | 6+ |

---

## 💵 Detailed Cost Breakdown

| Service | Configuration | Monthly Cost | Annual Cost |
|---------|--------------|--------------|-------------|
| **ECS Fargate** | 2 tasks × 1 vCPU × 2 GB × 730 hrs | $59.86 | $718.32 |
| **DocumentDB** | db.r5.large × 2 instances + 50GB storage | $405.00 | $4,860.00 |
| **ElastiCache Redis** | cache.t3.medium × 2 nodes | $49.64 | $595.68 |
| **Application Load Balancer** | 1 ALB + data processing | $20.00 | $240.00 |
### 15. Monitoring - CloudWatch
**Log Groups:** `/ecs/jr-fleet-backend` (7-day retention)  
**Alarms:** ECS CPU (>85%), ALB unhealthy targets, 5XX errors (critical only)  
**Dashboard:** Use AWS Console built-in views (no custom dashboard)
- **Cost Savings:** ~$12/month (reduced retention, fewer alarms, no custom dashboard)

### 16. Tracing - X-Ray (**Disabled for Cost Savings**)
- **Purpose:** Distributed tracing for API calls, DB queries
- **Alternative:** Use CloudWatch Logs Insights for debugging
- **Cost Savings:** ~$5/month
## 📞 Deployment Support Information

### Application Technical Details

**Backend:**
- Framework: FastAPI (Python 3.11)
- Dependencies: See `backend/requirements.txt`
- Container Port: 8000
- Health Check Endpoint: `/health`
- API Documentation: `/docs` (Swagger UI)

**Frontend:**
- Framework: React 19.0
- Build Command: `npm run build`
- Build Output: `build/` directory
- Environment Variable: `REACT_APP_API_URL`

**Database:**
- Type: MongoDB-compatible (DocumentDB or MongoDB Atlas)
- Collections: 25+ (see DATABASE_SCHEMA.md)
- Initialization: Automatic on first run
- Indexes: Created via application migration

### External Dependencies

- **Google Gemini API:** AI-powered predictions
- **Hugging Face:** ML model hosting
- **Forex API:** Currency exchange rates (forex-python library)

### Scaling Thresholds

- **Normal Load:** 2 ECS tasks handle ~1,000 concurrent users
- **High Load:** Auto-scale to 10 tasks for ~5,000 concurrent users
- **Database:** db.r5.large supports ~500 connections
- **Redis:** cache.t3.medium supports ~65,000 connections

---

## 🔧 Post-Deployment Verification
### 17. Email - Resend
- **Provider:** Resend (HTTPS API; `backend/email_service.py`)
- **Configuration:** `RESEND_API_KEY`, `SENDER_EMAIL` (domain verified in Resend)
- **Uses:** Password resets, maintenance/driver notifications, scheduled reports
- **Limits:** Per Resend plan (see [resend.com](https://resend.com))

### 18. Backups
- **DocumentDB:** Daily snapshots, 3-day retention
- **S3:** No versioning (manual backups when needed)
- **Cost Savings:** ~$8/month (reduced retention + no versioning storage)---

## Cost Breakdown| Service | Original | Optimized | Savings |
|---------|----------|-----------|----------|
| ECS Fargate | $60 | **$15** | $45 |
| DocumentDB | $405 | **$70** | $335 |
| ElastiCache Redis | $50 | **$15** | $35 |
| Application Load Balancer | $20 | **$20** | $0 |
| S3 | $15 | **$7** | $8 |
| CloudFront | $85 | **$55** | $30 |
| Route 53 | $0.50 | **$0.50** | $0 |
| NAT Gateway | $35 | **$35** | $0 |
| Data Transfer | $45 | **$30** | $15 |
| CloudWatch | $20 | **$8** | $12 |
| Secrets Manager (2) | $0.80 | **$0.80** | $0 |
| Resend | ~$0 | **~$0** | Pilot volume typically within free/low tier |
| WAF | $5 | **$1** | $4 |
| Backups | $10 | **$2** | $8 |
| ECR + Misc | $5.20 | **$3** | $2.20 |
| **TOTAL** | **$757.50** | **$263.30** | **$494.20 (65% savings)** |

**Key Optimizations Applied:**
- ✅ **Fargate Spot (70% weight)** + smaller tasks (0.5 vCPU, 1GB) → Save $45
- ✅ **DocumentDB:** db.t3.medium single-node (not db.r5.large × 2) → Save $335
- ✅ **Redis:** cache.t3.small single-node (not cache.t3.medium × 2) → Save $35
- ✅ **S3 Intelligent-Tiering** + no versioning + shorter lifecycle → Save $8
- ✅ **CloudFront PriceClass_100** (US/Canada/EU only, not global) → Save $30
- ✅ **CloudWatch:** 7-day retention, no custom dashboard → Save $12
- ✅ **WAF:** ALB only with minimal rules (not CloudFront) → Save $4
- ✅ **X-Ray disabled** (use CloudWatch Logs Insights) → Save $5
- ✅ **3-day backup retention** (not 7 days) → Save $8

**Production Upgrade Path (when scaling):**
- DocumentDB Multi-AZ + replica: Add $200/month
- Redis Multi-AZ + replica: Add $15/month
- 30-day log retention: Add $10/month
- Custom dashboard: Add $3/month
- **Production HA cost:** ~$495/month (still 35% cheaper)

**Further Optimization Options:**
- DocumentDB 1-year Reserved Instance: Save $25/month more
- VPC Endpoints (S3, ECR, Secrets): Save $10-15/month on NAT
- **Lowest possible cost:** $220-240/month---

## Pre-Deployment Requirements

**Credentials Needed:**
- AWS account with admin access
- Domain: jrfleetsolutions.com (owned)
- Google Gemini API key
- Hugging Face token
- Git repository access

**Application Details:**
- **Backend:** FastAPI (Python 3.11), port 8000, health check `/health`
- **Frontend:** React 19.0, build output in `build/` directory
- **Database:** MongoDB-compatible, 25+ collections, auto-initialization
- **External APIs:** Google Gemini, Hugging Face, Forex rates

**Scaling Capacity (Optimized):**
- **Initial:** 1 Spot task (~500 concurrent users)
- **Normal:** 2 tasks (~1,000 concurrent users)
- **High Load:** Auto-scale to 6 tasks (~3,000 concurrent users)
- **Database:** db.t3.medium supports ~200 connections (sufficient for API load)
- **Redis:** cache.t3.small supports ~25,000 connections

**Note:** These optimizations prioritize cost savings. For production with strict SLA requirements, consider the upgrade path to Multi-AZ database and cache.

---

## Post-Deployment Checks

```bash
# Verify services
curl https://api.jrfleetsolutions.com/health
curl -I https://app.jrfleetsolutions.com
```

**Performance Targets:**
- API response (p95): <500ms
- Frontend load: <3s
- CloudFront cache hit: >80%

**Security Validation:**
- SSL Grade: A+
- No public database access
- WAF active
- CloudTrail enabled

---

**Reference:** See `AWS_DEPLOYMENT_GUIDE.md` for complete step-by-step deployment instructions.
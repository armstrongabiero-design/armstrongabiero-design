# AWS Pilot Phase Requirements - JR Fleet Management System

**Environment:** Pilot/Testing  
**Region:** us-east-1  
**Target Users:** ~700 concurrent users  
**Estimated Monthly Cost:** $145  
**Deployment Timeline:** 1-2 business days  
**Duration:** 3-6 months pilot period

---

## Overview

This is a minimal, cost-effective deployment designed specifically for pilot testing with approximately 700 users. The architecture prioritizes cost savings while maintaining functionality for proof-of-concept validation.

---

## Infrastructure Components

### 1. Networking (VPC)
- **VPC:** 10.0.0.0/16 with DNS hostnames enabled
- **Subnets:** 2 public (10.0.1-2.0/24) + 2 private (10.0.11-12.0/24) across us-east-1a/b
- **Internet Gateway:** 1 for public subnets
- **NAT Gateway:** **0** - Use VPC Endpoints instead (cost optimization)
- **VPC Endpoints:** S3, ECR, Secrets Manager (no NAT charges)
- **Route Tables:** 2 (public and private)

### 2. Security Groups
| Name | Inbound | Outbound |
|------|---------|----------|
| ALB-SG | HTTP/HTTPS from 0.0.0.0/0 | All to ECS-SG |
| ECS-SG | Port 8000 from ALB-SG | All (via VPC endpoints) |
| DocumentDB-SG | Port 27017 from ECS-SG | None |

**Note:** No Redis security group needed (using basic DocumentDB caching)

---

## Core Services

### 3. Database - Amazon DocumentDB
- **Cluster:** Single-AZ only (not Multi-AZ)
- **Instances:** 1x **db.t3.small** (2 vCPU, 2 GiB) - primary only
- **Storage:** 10 GB initial, auto-scaling disabled
- **Backups:** 1-day retention, daily at 03:00 UTC
- **Encryption:** At-rest (default AWS managed key) and in-transit (TLS)
- **Connection:** `mongodb://admin:pass@endpoint:27017/?ssl=true`
- **Capacity:** ~150 concurrent connections (sufficient for 700 users)
- **Monthly Cost:** ~$35

**Pilot Optimization:**
- No replica for high availability (acceptable for testing)
- Smallest instance size for cost efficiency
- Minimal backup retention

### 4. Cache - **REMOVED** (Cost Optimization)
- **Alternative:** Use DocumentDB in-memory caching
- **Session Storage:** Store sessions in DocumentDB temporarily
- **Tradeoff:** Slightly slower API responses (~50-100ms increase) but acceptable for pilot
- **Cost Savings:** $15/month

---

## Compute & Container

### 5. Container Registry - ECR
- **Repository:** jr-fleet-backend-pilot
- **Features:** Scan on push, lifecycle (keep last 3 images only)
- **Storage:** ~1 GB
- **Monthly Cost:** ~$0.10

### 6. Compute - ECS Fargate
- **Cluster:** jr-fleet-pilot-cluster
- **Capacity:** **100% Fargate Spot** (cost optimization for pilot)
- **Task Definition:** **0.25 vCPU, 512 MB memory** (minimal size)
- **Service:** 1-3 tasks (auto-scaling on 80% CPU)
- **Networking:** Private subnets, ECS-SG, no public IP
- **Logging:** CloudWatch Logs `/ecs/jr-fleet-pilot` (3-day retention)
- **Health Check:** `/health` endpoint every 60s (less frequent checks)
- **Monthly Cost:** ~$8 (1 Spot task running)

**Pilot Configuration:**
- Start with 1 task, scale to 3 max
- 0.25 vCPU handles ~250 concurrent users per task
- Spot interruption acceptable during pilot testing

### 7. Load Balancer - ALB
- **Type:** Application Load Balancer (internet-facing)
- **Subnets:** 2 public subnets (us-east-1a, 1b)
- **Target Group:** IP targets on port 8000
- **Listeners:** HTTP:80 (redirect), HTTPS:443 (forward)
- **Health Check:** `/health` every 60s (less frequent)
- **Idle Timeout:** 60s (default)
- **Monthly Cost:** ~$18

---

## Storage & CDN

### 8. Storage - S3 Buckets
**jr-fleet-pilot-documents:**
- Purpose: User uploads (pilot data)
- Size: ~5 GB expected
- **No versioning**, encryption (AES-256), CORS enabled
- Lifecycle: **Intelligent-Tiering (immediate)** → Glacier (60d) → Delete (90d)
- Monthly Cost: ~$2

**jr-fleet-pilot-frontend:**
- Purpose: React app build
- Size: ~1 GB
- CloudFront OAI only, **no versioning**
- Monthly Cost: ~$0.50

### 9. CDN - CloudFront
- **Purpose:** Frontend delivery
- **Origin:** S3 (jr-fleet-pilot-frontend)
- **Price Class:** **PriceClass_100** (US, Canada, Europe only)
- **Cache:** Aggressive caching (max TTL)
- **Domain:** `gti.jrfleetsolutions.com`
- **Expected Traffic:** ~100 GB/month for 700 users
- **Monthly Cost:** ~$10

---

## DNS & Security

### 10. DNS - Route 53
- **Hosted Zone:** Use existing `jrfleetsolutions.com` (no additional cost)
- **New Records:**
  - `gti.jrfleetsolutions.com` → CloudFront (A alias)
  - `api-gti.jrfleetsolutions.com` → ALB (A alias)
- **Monthly Cost:** ~$0 (existing zone)

### 11. SSL Certificate - ACM
- **Certificate:** Use existing wildcard `*.jrfleetsolutions.com`
- **Monthly Cost:** $0 (free)

### 12. Secrets - AWS Secrets Manager
**Single consolidated secret:** `jr-fleet-pilot/config`
- Combined database credentials + app config in one secret
- Manual rotation only
- Monthly Cost: ~$0.40

### 13. Security - **No WAF** (Pilot Phase)
- **Alternative:** Use ALB built-in rate limiting (free)
- **Rate Limit:** 500 requests per minute per IP (ALB listener rule)
- **Tradeoff:** Basic protection only, acceptable for pilot
- **Cost Savings:** $5/month

---

## Monitoring & Support

### 14. IAM Roles
- **jr-fleet-pilot-ecs-execution-role:** Task startup, ECR, Secrets access
- **jr-fleet-pilot-ecs-task-role:** S3 (scoped to pilot buckets), CloudWatch (email via **Resend** uses API key in Secrets Manager — no SES IAM)

### 15. Monitoring - CloudWatch
- **Log Groups:** `/ecs/jr-fleet-pilot` (**3-day retention only**)
- **Alarms:** 2 critical alarms only
  1. ALB unhealthy targets (≥1)
  2. ECS CPU (>90% for 10 min)
- **Dashboard:** No custom dashboard (use AWS Console)
- **Monthly Cost:** ~$3

### 16. Tracing - **Disabled**
- Use CloudWatch Logs grep for debugging
- Cost Savings: $5/month

### 17. Email - Resend
- **Provider:** [Resend](https://resend.com) (HTTPS API; `resend` Python package in backend)
- **Secrets:** `RESEND_API_KEY` and `SENDER_EMAIL` (verified sender/domain in Resend dashboard)
- **Expected Volume:** ~2,000 emails/month (pilot users)
- **Monthly Cost:** Within Resend free tier or low pay-as-you-go (confirm on resend.com pricing; not an AWS line item)

### 18. Backups - Minimal
- **DocumentDB:** 1-day automated snapshot only
- **S3:** No versioning (pilot data not critical)
- **Monthly Cost:** ~$1

---

## Cost Breakdown

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **ECS Fargate Spot** | 1 task × 0.25 vCPU × 512MB | **$8** |
| **DocumentDB** | db.t3.small × 1 + 10GB | **$35** |
| **ElastiCache Redis** | REMOVED | **$0** |
| **Application Load Balancer** | 1 ALB (minimal traffic) | **$18** |
| **S3** | ~6 GB total | **$2.50** |
| **CloudFront** | 100 GB transfer (PriceClass_100) | **$10** |
| **Route 53** | Use existing zone | **$0** |
| **NAT Gateway** | REMOVED (VPC Endpoints) | **$0** |
| **VPC Endpoints** | S3, ECR, Secrets | **$22** |
| **Data Transfer** | ~50 GB out | **$5** |
| **CloudWatch** | Minimal logs (3d retention) | **$3** |
| **Secrets Manager** | 1 secret | **$0.40** |
| **Resend** | ~2K emails | **~$0** (typical pilot; verify Resend plan) |
| **WAF** | REMOVED | **$0** |
| **Backups** | 1-day retention | **$1** |
| **ECR** | 1 GB storage | **$0.10** |
| **Certificate Manager** | Free (existing wildcard) | **$0** |
| **X-Ray** | REMOVED | **$0** |
| **TOTAL** | | **~$145/month** |

---

## Pilot Phase Optimizations

### What's Different from Production?

| Feature | Production | Pilot | Savings |
|---------|-----------|-------|---------|
| **Database** | db.t3.medium Multi-AZ | db.t3.small Single-AZ | $35 |
| **Cache** | Redis cache.t3.small | None (DocumentDB only) | $15 |
| **Compute** | 2 tasks, 0.5 vCPU each | 1 Spot task, 0.25 vCPU | $7 |
| **NAT Gateway** | 1 gateway | None (VPC Endpoints) | $13 |
| **WAF** | ALB + minimal rules | None (ALB rate limit) | $1 |
| **CloudWatch** | 7-day retention | 3-day retention | $5 |
| **X-Ray** | Disabled | Disabled | $0 |
| **Backups** | 3-day retention | 1-day retention | $1 |
| **CDN** | 1 TB traffic | 100 GB traffic | $75 |
| **Total Savings** | $263/month | $145/month | **$118 (45% cheaper)** |

---

## Capacity & Performance

### Expected Performance
- **Users:** Up to 700 concurrent users
- **API Response Time:** <1 second (p95) - acceptable for pilot
- **Database Connections:** ~150 concurrent (sufficient)
- **Storage:** 6 GB (plenty for 3-6 month pilot)
- **Email Throughput:** 2,000 emails/month
- **Uptime Target:** 95% (pilot SLA, not production-grade)

### Scaling Limits
- **Current:** 1 Fargate Spot task (250 users)
- **Auto-scale:** Up to 3 tasks (750 users)
- **Database:** db.t3.small handles 700 users comfortably

### Known Limitations (Acceptable for Pilot)
1. **No High Availability:** Single-AZ database, Spot interruptions possible
2. **No Redis Cache:** Slightly slower API responses (+50-100ms)
3. **Minimal Monitoring:** Only critical alarms, 3-day log retention
4. **No WAF:** Basic rate limiting only
5. **Smaller Compute:** May have occasional slowness during peak usage

---

## Pre-Deployment Checklist

**Required:**
- [ ] AWS account with admin access
- [ ] Subdomain delegation: `gti.jrfleetsolutions.com`, `api-gti.jrfleetsolutions.com`
- [ ] Google Gemini API key
- [ ] Hugging Face token
- [ ] Resend: `RESEND_API_KEY` in Secrets Manager; `SENDER_EMAIL` verified in Resend (domain DNS as required by Resend)

**Not Required (Cost Savings):**
- NAT Gateway (using VPC Endpoints)
- Redis cache
- WAF
- X-Ray tracing
- Custom CloudWatch dashboard

---

## Pilot Success Criteria

### Migration to Production Triggers
Migrate to production configuration when:
- [ ] Pilot validates product-market fit
- [ ] User base exceeds 500 concurrent users consistently
- [ ] API response time degrades below acceptable levels
- [ ] High availability becomes business-critical
- [ ] Data retention requirements increase

### Production Upgrade Cost
- Migrate from pilot ($145) to optimized production ($263) = +$118/month
- Migrate from pilot ($145) to full production ($757) = +$612/month

---

## Deployment Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Day 1 Morning** | 2 hours | VPC, subnets, security groups, VPC endpoints |
| **Day 1 Afternoon** | 3 hours | DocumentDB, ECR, build/push Docker image |
| **Day 2 Morning** | 2 hours | ECS cluster, task definition, ALB setup |
| **Day 2 Afternoon** | 2 hours | Frontend build, S3 upload, CloudFront setup |
| **Day 2 Evening** | 1 hour | DNS, testing, go-live |

**Total:** 1-2 business days for experienced cloud engineer

---

## Post-Pilot Actions

### Data Migration Strategy
```bash
# Export pilot data before shutdown
mongodump --uri="mongodb://pilot-endpoint:27017" --out=/backup/pilot-data

# Import to production
mongorestore --uri="mongodb://prod-endpoint:27017" /backup/pilot-data
```

### S3 Data Sync
```bash
# Copy pilot documents to production bucket
aws s3 sync s3://jr-fleet-pilot-documents s3://jr-fleet-documents
```

### Cleanup After Pilot
```bash
# Delete pilot resources to stop charges
aws ecs delete-service --cluster jr-fleet-pilot-cluster --service pilot-service --force
aws docdb delete-db-instance --db-instance-identifier pilot-docdb
aws s3 rb s3://jr-fleet-pilot-documents --force
aws cloudfront delete-distribution --id PILOT_DIST_ID
```

**Estimated cleanup time:** 30 minutes

---

## Risk Assessment

### High Risk (Mitigated)
- **Spot Interruption:** Auto-restart within 2 minutes, acceptable downtime for pilot
- **Single DB Node:** Daily backups + 1-day snapshot retention

### Medium Risk (Acceptable)
- **No Redis Cache:** Slightly slower responses, not critical for pilot
- **Limited Monitoring:** 3-day logs sufficient for debugging pilot issues
- **No WAF:** ALB rate limiting provides basic protection

### Low Risk
- **Small Compute:** Can auto-scale to 3 tasks if needed
- **Storage Limits:** 10GB sufficient for 6-month pilot

---

## Support & Contact

**Pilot Phase Support:**
- **Response Time:** Best-effort (not 24/7)
- **Monitoring:** Business hours only
- **Incident Response:** Email-based

**Escalation Path:**
- Critical issues: Deploy additional Fargate task manually
- Database issues: Restore from daily snapshot
- Performance issues: Scale to 3 tasks immediately

---

**Reference:** See `AWS_DEPLOYMENT_GUIDE.md` for step-by-step deployment instructions (adapt for pilot configuration).

**Pilot Duration:** 3-6 months, then evaluate for production migration or shutdown.

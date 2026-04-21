# AWS Deployment Guide - JR Fleet Solutions

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Infrastructure Setup](#infrastructure-setup)
4. [Database Deployment](#database-deployment)
5. [Backend Deployment](#backend-deployment)
6. [Frontend Deployment](#frontend-deployment)
7. [Security Configuration](#security-configuration)
8. [Monitoring & Logging](#monitoring--logging)
9. [CI/CD Pipeline](#cicd-pipeline)
10. [Cost Optimization](#cost-optimization)
11. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AWS CLOUD INFRASTRUCTURE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │   Route 53   │────────▶│  CloudFront  │                      │
│  │     DNS      │         │     CDN      │                      │
│  └──────────────┘         └───────┬──────┘                      │
│                                    │                              │
│                                    │                              │
│                                    ▼                              │
│                           ┌──────────────┐                       │
│                           │     ALB      │                       │
│                           │ Application  │                       │
│                           │Load Balancer │                       │
│                           └──────┬───────┘                       │
│                                  │                                │
│                   ┌──────────────┼──────────────┐               │
│                   │              │              │               │
│          ┌────────▼─────┐  ┌────▼──────┐  ┌───▼────────┐      │
│          │   ECS/Fargate │  │   ECS/    │  │   ECS/     │      │
│          │   Backend API │  │  Fargate  │  │  Fargate   │      │
│          │   (Primary)   │  │  (AZ-2)   │  │  (AZ-3)    │      │
│          └───────┬───────┘  └───────────┘  └────────────┘      │
│                  │                                               │
│                  ▼                                               │
│          ┌───────────────┐                                      │
│          │   DocumentDB  │◀────────┐                            │
│          │   (MongoDB)   │         │                            │
│          │  Multi-AZ     │    ┌────┴────────┐                  │
│          └───────────────┘    │  ElastiCache │                  │
│                               │    Redis     │                  │
│          ┌───────────────┐    └──────────────┘                 │
│          │      S3       │                                      │
│          │  Documents/   │                                      │
│          │   Assets      │                                      │
│          └───────────────┘                                      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Security & Monitoring Layer                   │   │
│  │  • VPC with Private/Public Subnets                      │   │
│  │  • WAF for DDoS Protection                              │   │
│  │  • Secrets Manager for Credentials                      │   │
│  │  • CloudWatch for Logs & Metrics                        │   │
│  │  • AWS Certificate Manager for SSL/TLS                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | AWS Service | Purpose |
|-----------|-------------|---------|
| **Frontend** | CloudFront + S3 | React SPA with global CDN delivery |
| **Backend API** | ECS Fargate | Containerized FastAPI application |
| **Database** | DocumentDB | MongoDB-compatible database |
| **Cache** | ElastiCache Redis | Session management & caching |
| **File Storage** | S3 | Documents, images, reports |
| **Load Balancer** | Application Load Balancer | Traffic distribution |
| **DNS** | Route 53 | Domain management |
| **CDN** | CloudFront | Global content delivery |
| **Email** | **Resend** (external API) | Transactional emails (`RESEND_API_KEY`, `SENDER_EMAIL`; see `backend/email_service.py`) |
| **AI Services** | Amazon Bedrock / SageMaker | Predictive maintenance AI |

---

## 📦 Prerequisites

### Required Tools & Accounts

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
   ```bash
   aws --version  # Should be 2.x or higher
   aws configure  # Set up credentials
   ```

3. **Docker** installed locally
   ```bash
   docker --version  # 20.x or higher
   ```

4. **Node.js** (v18+) and npm
   ```bash
   node --version
   npm --version
   ```

5. **Python** (3.11+)
   ```bash
   python3 --version
   ```

6. **Git** for version control
   ```bash
   git --version
   ```

### AWS IAM Permissions Required

Create an IAM user/role with these policies:
- `AmazonECS_FullAccess`
- `AmazonS3FullAccess`
- `CloudFrontFullAccess`
- `AmazonRoute53FullAccess`
- `AWSCertificateManagerFullAccess`
- `SecretsManagerReadWrite`
- `AmazonDocDBFullAccess`
- `ElastiCacheFullAccess`
- *(No `AmazonSESFullAccess` required — the app uses **Resend**, not SES.)*
- `CloudWatchFullAccess`
- `IAMFullAccess` (for role creation)

### Domain Requirements

- Purchase/configure a domain (e.g., `app.jrfleetsolutions.com`)
- Access to DNS management
- SSL certificate (AWS Certificate Manager provides free certs)

---

## 🚀 Infrastructure Setup

### Step 1: Configure AWS CLI

```bash
# Configure default credentials
aws configure
# AWS Access Key ID: YOUR_ACCESS_KEY
# AWS Secret Access Key: YOUR_SECRET_KEY
# Default region name: us-east-1
# Default output format: json

# Verify configuration
aws sts get-caller-identity
```

### Step 2: Create VPC Network

Create a VPC with public and private subnets across 3 Availability Zones.

```bash
# Create VPC
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=jr-fleet-vpc}]'

# Note the VPC ID from output
export VPC_ID=vpc-xxxxxxxxx

# Enable DNS hostnames
aws ec2 modify-vpc-attribute \
  --vpc-id $VPC_ID \
  --enable-dns-hostnames

# Create Internet Gateway
aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=jr-fleet-igw}]'

export IGW_ID=igw-xxxxxxxxx

# Attach Internet Gateway to VPC
aws ec2 attach-internet-gateway \
  --vpc-id $VPC_ID \
  --internet-gateway-id $IGW_ID

# Create Public Subnets (3 AZs)
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=jr-fleet-public-1a}]'

aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=jr-fleet-public-1b}]'

aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.3.0/24 \
  --availability-zone us-east-1c \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=jr-fleet-public-1c}]'

# Create Private Subnets (3 AZs)
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.11.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=jr-fleet-private-1a}]'

aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.12.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=jr-fleet-private-1b}]'

aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.13.0/24 \
  --availability-zone us-east-1c \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=jr-fleet-private-1c}]'
```

### Step 3: Configure Route Tables

```bash
# Create Public Route Table
aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=jr-fleet-public-rt}]'

export PUBLIC_RT_ID=rtb-xxxxxxxxx

# Add route to Internet Gateway
aws ec2 create-route \
  --route-table-id $PUBLIC_RT_ID \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id $IGW_ID

# Associate public subnets with public route table
# (Repeat for each public subnet)
aws ec2 associate-route-table \
  --subnet-id subnet-xxxxxxxxx \
  --route-table-id $PUBLIC_RT_ID
```

### Step 4: Create NAT Gateway (for private subnets)

```bash
# Allocate Elastic IP for NAT Gateway
aws ec2 allocate-address --domain vpc

export EIP_ALLOC_ID=eipalloc-xxxxxxxxx

# Create NAT Gateway in public subnet
aws ec2 create-nat-gateway \
  --subnet-id subnet-xxxxxxxxx \
  --allocation-id $EIP_ALLOC_ID \
  --tag-specifications 'ResourceType=nat-gateway,Tags=[{Key=Name,Value=jr-fleet-nat}]'

export NAT_GW_ID=nat-xxxxxxxxx

# Create Private Route Table
aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=jr-fleet-private-rt}]'

export PRIVATE_RT_ID=rtb-xxxxxxxxx

# Add route to NAT Gateway
aws ec2 create-route \
  --route-table-id $PRIVATE_RT_ID \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id $NAT_GW_ID
```

### Step 5: Create Security Groups

```bash
# ALB Security Group (allow HTTP/HTTPS from internet)
aws ec2 create-security-group \
  --group-name jr-fleet-alb-sg \
  --description "Security group for Application Load Balancer" \
  --vpc-id $VPC_ID

export ALB_SG_ID=sg-xxxxxxxxx

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# ECS Tasks Security Group (allow traffic from ALB)
aws ec2 create-security-group \
  --group-name jr-fleet-ecs-sg \
  --description "Security group for ECS tasks" \
  --vpc-id $VPC_ID

export ECS_SG_ID=sg-xxxxxxxxx

aws ec2 authorize-security-group-ingress \
  --group-id $ECS_SG_ID \
  --protocol tcp \
  --port 8000 \
  --source-group $ALB_SG_ID

# DocumentDB Security Group (allow from ECS)
aws ec2 create-security-group \
  --group-name jr-fleet-docdb-sg \
  --description "Security group for DocumentDB" \
  --vpc-id $VPC_ID

export DOCDB_SG_ID=sg-xxxxxxxxx

aws ec2 authorize-security-group-ingress \
  --group-id $DOCDB_SG_ID \
  --protocol tcp \
  --port 27017 \
  --source-group $ECS_SG_ID

# Redis Security Group (allow from ECS)
aws ec2 create-security-group \
  --group-name jr-fleet-redis-sg \
  --description "Security group for Redis" \
  --vpc-id $VPC_ID

export REDIS_SG_ID=sg-xxxxxxxxx

aws ec2 authorize-security-group-ingress \
  --group-id $REDIS_SG_ID \
  --protocol tcp \
  --port 6379 \
  --source-group $ECS_SG_ID
```

---

## 🗄️ Database Deployment

### Option 1: Amazon DocumentDB (Recommended for Production)

DocumentDB is AWS's MongoDB-compatible database service.

```bash
# Create DocumentDB subnet group
aws docdb create-db-subnet-group \
  --db-subnet-group-name jr-fleet-docdb-subnet-group \
  --db-subnet-group-description "Subnet group for JR Fleet DocumentDB" \
  --subnet-ids subnet-xxxxxxxx subnet-yyyyyyyy subnet-zzzzzzzz

# Create DocumentDB cluster
aws docdb create-db-cluster \
  --db-cluster-identifier jr-fleet-docdb-cluster \
  --engine docdb \
  --master-username admin \
  --master-user-password "YourSecurePassword123!" \
  --db-subnet-group-name jr-fleet-docdb-subnet-group \
  --vpc-security-group-ids $DOCDB_SG_ID \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00" \
  --preferred-maintenance-window "mon:04:00-mon:05:00" \
  --storage-encrypted

# Create DocumentDB instance (repeat for multi-AZ)
aws docdb create-db-instance \
  --db-instance-identifier jr-fleet-docdb-instance-1 \
  --db-instance-class db.r5.large \
  --engine docdb \
  --db-cluster-identifier jr-fleet-docdb-cluster

# Get the cluster endpoint
aws docdb describe-db-clusters \
  --db-cluster-identifier jr-fleet-docdb-cluster \
  --query 'DBClusters[0].Endpoint' \
  --output text
```

**Connection String Format:**
```
mongodb://admin:YourSecurePassword123!@jr-fleet-docdb-cluster.cluster-xxxxxxxxx.us-east-1.docdb.amazonaws.com:27017/?ssl=true&ssl_ca_certs=rds-combined-ca-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false
```

### Option 2: MongoDB Atlas (Alternative)

1. Create account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create new cluster (M10+ for production)
3. Configure network access (whitelist AWS VPC CIDR)
4. Create database user
5. Get connection string

### Create ElastiCache Redis Cluster

```bash
# Create Redis subnet group
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name jr-fleet-redis-subnet-group \
  --cache-subnet-group-description "Subnet group for Redis" \
  --subnet-ids subnet-xxxxxxxx subnet-yyyyyyyy subnet-zzzzzzzz

# Create Redis cluster
aws elasticache create-replication-group \
  --replication-group-id jr-fleet-redis \
  --replication-group-description "Redis cluster for JR Fleet" \
  --engine redis \
  --cache-node-type cache.t3.medium \
  --num-cache-clusters 2 \
  --automatic-failover-enabled \
  --cache-subnet-group-name jr-fleet-redis-subnet-group \
  --security-group-ids $REDIS_SG_ID \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled

# Get Redis endpoint
aws elasticache describe-replication-groups \
  --replication-group-id jr-fleet-redis \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' \
  --output text
```

---

## 🔧 Backend Deployment

### Step 1: Store Secrets in AWS Secrets Manager

```bash
# Create secret for database credentials
aws secretsmanager create-secret \
  --name jr-fleet/database \
  --description "Database credentials" \
  --secret-string '{
    "MONGODB_URI": "mongodb://admin:password@endpoint:27017/fleet_db?ssl=true",
    "DATABASE_NAME": "fleet_management"
  }'

# Create secret for application configuration
aws secretsmanager create-secret \
  --name jr-fleet/app-config \
  --description "Application configuration" \
  --secret-string '{
    "JWT_SECRET_KEY": "your-super-secret-jwt-key-change-this",
    "GEMINI_API_KEY": "your-gemini-api-key",
    "HUGGINGFACE_TOKEN": "your-huggingface-token",
    "AWS_ACCESS_KEY_ID": "your-aws-access-key",
    "AWS_SECRET_ACCESS_KEY": "your-aws-secret-key",
    "S3_BUCKET_NAME": "jr-fleet-documents",
    "REDIS_URL": "redis://jr-fleet-redis.xxxxx.cache.amazonaws.com:6379",
    "RESEND_API_KEY": "your-resend-api-key",
    "SENDER_EMAIL": "noreply@jrfleetsolutions.com"
  }'
```

### Step 2: Create S3 Bucket for Documents

```bash
# Create bucket
aws s3 mb s3://jr-fleet-documents --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket jr-fleet-documents \
  --versioning-configuration Status=Enabled

# Configure CORS
cat > cors-config.json << 'EOF'
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://app.jrfleetsolutions.com"],
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

aws s3api put-bucket-cors \
  --bucket jr-fleet-documents \
  --cors-configuration file://cors-config.json

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket jr-fleet-documents \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

### Step 3: Create ECR Repository

```bash
# Create repository
aws ecr create-repository \
  --repository-name jr-fleet-backend \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256

# Get repository URI
export ECR_REPO_URI=$(aws ecr describe-repositories \
  --repository-names jr-fleet-backend \
  --query 'repositories[0].repositoryUri' \
  --output text)

echo "ECR Repository URI: $ECR_REPO_URI"
```

### Step 4: Build and Push Docker Image

Create `backend/Dockerfile`:

```dockerfile
# Use official Python runtime as base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run application
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

Create `backend/.dockerignore`:

```
__pycache__
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
.venv/
pip-log.txt
pip-delete-this-directory.txt
.pytest_cache/
tests/
*.md
.git
.gitignore
```

Build and push:

```bash
cd backend

# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_REPO_URI

# Build image
docker build -t jr-fleet-backend:latest .

# Tag image
docker tag jr-fleet-backend:latest $ECR_REPO_URI:latest
docker tag jr-fleet-backend:latest $ECR_REPO_URI:v1.0.0

# Push image
docker push $ECR_REPO_URI:latest
docker push $ECR_REPO_URI:v1.0.0

cd ..
```

### Step 5: Create ECS Cluster

```bash
# Create cluster
aws ecs create-cluster \
  --cluster-name jr-fleet-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=1 \
    capacityProvider=FARGATE_SPOT,weight=4

# Create CloudWatch log group
aws logs create-log-group \
  --log-group-name /ecs/jr-fleet-backend
```

### Step 6: Create IAM Roles

Create execution role for ECS tasks:

```bash
# Create trust policy
cat > ecs-task-execution-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create execution role
aws iam create-role \
  --role-name jr-fleet-ecs-execution-role \
  --assume-role-policy-document file://ecs-task-execution-trust-policy.json

# Attach AWS managed policies
aws iam attach-role-policy \
  --role-name jr-fleet-ecs-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Create policy for Secrets Manager access
cat > secrets-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:*:secret:jr-fleet/*"
      ]
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name jr-fleet-secrets-policy \
  --policy-document file://secrets-policy.json

aws iam attach-role-policy \
  --role-name jr-fleet-ecs-execution-role \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/jr-fleet-secrets-policy

# Create task role (for S3 access; email is via Resend API + secret, not SES)
aws iam create-role \
  --role-name jr-fleet-ecs-task-role \
  --assume-role-policy-document file://ecs-task-execution-trust-policy.json

aws iam attach-role-policy \
  --role-name jr-fleet-ecs-task-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
```

### Step 7: Create Application Load Balancer

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name jr-fleet-alb \
  --subnets subnet-xxxxxxxx subnet-yyyyyyyy subnet-zzzzzzzz \
  --security-groups $ALB_SG_ID \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4

export ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names jr-fleet-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

# Create target group
aws elbv2 create-target-group \
  --name jr-fleet-backend-tg \
  --protocol HTTP \
  --port 8000 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-enabled \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3

export TG_ARN=$(aws elbv2 describe-target-groups \
  --names jr-fleet-backend-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

# Create listener (HTTP - will redirect to HTTPS after SSL setup)
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

### Step 8: Create ECS Task Definition

Create `task-definition.json`:

```json
{
  "family": "jr-fleet-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/jr-fleet-ecs-execution-role",
  "taskRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/jr-fleet-ecs-task-role",
  "containerDefinitions": [
    {
      "name": "jr-fleet-backend",
      "image": "YOUR_ECR_REPO_URI:latest",
      "cpu": 1024,
      "memory": 2048,
      "essential": true,
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "ENVIRONMENT",
          "value": "production"
        },
        {
          "name": "AWS_REGION",
          "value": "us-east-1"
        }
      ],
      "secrets": [
        {
          "name": "MONGODB_URI",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:jr-fleet/database:MONGODB_URI::"
        },
        {
          "name": "JWT_SECRET_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:jr-fleet/app-config:JWT_SECRET_KEY::"
        },
        {
          "name": "GEMINI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:jr-fleet/app-config:GEMINI_API_KEY::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/jr-fleet-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

Register task definition:

```bash
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json
```

### Step 9: Create ECS Service

```bash
# Create service
aws ecs create-service \
  --cluster jr-fleet-cluster \
  --service-name jr-fleet-backend-service \
  --task-definition jr-fleet-backend \
  --desired-count 2 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-xxxxxxxx,subnet-yyyyyyyy,subnet-zzzzzzzz],
    securityGroups=[$ECS_SG_ID],
    assignPublicIp=DISABLED
  }" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=jr-fleet-backend,containerPort=8000" \
  --health-check-grace-period-seconds 60 \
  --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
  --enable-execute-command
```

### Step 10: Configure Auto Scaling

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/jr-fleet-cluster/jr-fleet-backend-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy (CPU-based)
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/jr-fleet-cluster/jr-fleet-backend-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

---

## ⚛️ Frontend Deployment

### Step 1: Build React Application

```bash
cd frontend

# Install dependencies
npm install

# Create production build
REACT_APP_API_URL=https://api.jrfleetsolutions.com npm run build

# Verify build
ls -lh build/
```

### Step 2: Create S3 Bucket for Frontend

```bash
# Create bucket
aws s3 mb s3://jr-fleet-frontend --region us-east-1

# Configure for static website hosting
aws s3 website s3://jr-fleet-frontend \
  --index-document index.html \
  --error-document index.html

# Upload build files
aws s3 sync build/ s3://jr-fleet-frontend/ \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "service-worker.js"

# Upload index.html with short cache
aws s3 cp build/index.html s3://jr-fleet-frontend/index.html \
  --cache-control "public, max-age=0, must-revalidate"

# Upload service worker with short cache
aws s3 cp build/service-worker.js s3://jr-fleet-frontend/service-worker.js \
  --cache-control "public, max-age=0, must-revalidate"
```

### Step 3: Create CloudFront Distribution

First, create an Origin Access Identity (OAI):

```bash
aws cloudfront create-cloud-front-origin-access-identity \
  --cloud-front-origin-access-identity-config \
    CallerReference="jr-fleet-frontend-$(date +%s)",Comment="OAI for JR Fleet frontend"

export OAI_ID=$(aws cloudfront list-cloud-front-origin-access-identities \
  --query 'CloudFrontOriginAccessIdentityList.Items[?Comment==`OAI for JR Fleet frontend`].Id' \
  --output text)
```

Update S3 bucket policy to allow CloudFront access:

```bash
cat > frontend-bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity $OAI_ID"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::jr-fleet-frontend/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket jr-fleet-frontend \
  --policy file://frontend-bucket-policy.json
```

Create CloudFront distribution configuration:

```bash
cat > cloudfront-config.json << 'EOF'
{
  "CallerReference": "jr-fleet-frontend-1234567890",
  "Comment": "CloudFront distribution for JR Fleet frontend",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-jr-fleet-frontend",
        "DomainName": "jr-fleet-frontend.s3.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": "origin-access-identity/cloudfront/YOUR_OAI_ID"
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-jr-fleet-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "Compress": true,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {
        "Forward": "none"
      }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 300
      }
    ]
  },
  "PriceClass": "PriceClass_100",
  "ViewerCertificate": {
    "CloudFrontDefaultCertificate": true
  }
}
EOF

# Create distribution
aws cloudfront create-distribution \
  --distribution-config file://cloudfront-config.json
```

---

## 🔒 Security Configuration

### Step 1: Request SSL Certificate

```bash
# Request certificate in us-east-1 (required for CloudFront)
aws acm request-certificate \
  --domain-name jrfleetsolutions.com \
  --subject-alternative-names "*.jrfleetsolutions.com" \
  --validation-method DNS \
  --region us-east-1

export CERT_ARN=$(aws acm list-certificates \
  --region us-east-1 \
  --query 'CertificateSummaryList[?DomainName==`jrfleetsolutions.com`].CertificateArn' \
  --output text)

# Get DNS validation records
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-1
```

Add the CNAME records to your DNS provider (Route 53 or external).

### Step 2: Configure WAF (Web Application Firewall)

```bash
# Create Web ACL
aws wafv2 create-web-acl \
  --name jr-fleet-waf \
  --scope CLOUDFRONT \
  --default-action Allow={} \
  --rules file://waf-rules.json \
  --visibility-config \
    SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=jr-fleet-waf \
  --region us-east-1
```

Create `waf-rules.json`:

```json
[
  {
    "Name": "RateLimitRule",
    "Priority": 1,
    "Statement": {
      "RateBasedStatement": {
        "Limit": 2000,
        "AggregateKeyType": "IP"
      }
    },
    "Action": {
      "Block": {}
    },
    "VisibilityConfig": {
      "SampledRequestsEnabled": true,
      "CloudWatchMetricsEnabled": true,
      "MetricName": "RateLimitRule"
    }
  },
  {
    "Name": "AWSManagedRulesCommonRuleSet",
    "Priority": 2,
    "Statement": {
      "ManagedRuleGroupStatement": {
        "VendorName": "AWS",
        "Name": "AWSManagedRulesCommonRuleSet"
      }
    },
    "OverrideAction": {
      "None": {}
    },
    "VisibilityConfig": {
      "SampledRequestsEnabled": true,
      "CloudWatchMetricsEnabled": true,
      "MetricName": "AWSManagedRulesCommonRuleSet"
    }
  }
]
```

### Step 3: Enable AWS Shield Standard

AWS Shield Standard is automatically enabled for all AWS customers at no additional charge.

### Step 4: Configure Resend for Email

The backend sends mail through **Resend** (`resend` Python package, `backend/email_service.py`). There is no Amazon SES setup.

1. Create an account at [resend.com](https://resend.com) and create an **API key**.
2. **Verify your sending domain** (and/or sender) in the Resend dashboard; set DNS records (SPF/DKIM) as Resend instructs.
3. Store secrets for ECS (or `.env` in non-AWS environments):
   - `RESEND_API_KEY` — required for sending
   - `SENDER_EMAIL` — must be an address/domain allowed by Resend (defaults to `onboarding@resend.dev` only for testing)

4. Ensure ECS tasks (or your API hosts) have **outbound HTTPS (443)** to `api.resend.com`.

```bash
# Optional: add/update Secrets Manager alongside other app config (example keys only)
# aws secretsmanager put-secret-value --secret-id jr-fleet/app-config --secret-string '...'
```

---

## 📊 Monitoring & Logging

### Step 1: Configure CloudWatch Dashboards

```bash
# Create custom dashboard
aws cloudwatch put-dashboard \
  --dashboard-name jr-fleet-dashboard \
  --dashboard-body file://dashboard-config.json
```

Create `dashboard-config.json`:

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ECS", "CPUUtilization", {"stat": "Average"}],
          [".", "MemoryUtilization", {"stat": "Average"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "ECS Service Metrics"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ApplicationELB", "TargetResponseTime", {"stat": "Average"}],
          [".", "RequestCount", {"stat": "Sum"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "ALB Metrics"
      }
    }
  ]
}
```

### Step 2: Set Up CloudWatch Alarms

```bash
# High CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name jr-fleet-high-cpu \
  --alarm-description "Alert when ECS CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# ALB unhealthy targets
aws cloudwatch put-metric-alarm \
  --alarm-name jr-fleet-unhealthy-targets \
  --alarm-description "Alert when unhealthy targets detected" \
  --metric-name UnHealthyHostCount \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1

# Database connection errors
aws cloudwatch put-metric-alarm \
  --alarm-name jr-fleet-db-connection-errors \
  --alarm-description "Alert on database connection failures" \
  --metric-name DatabaseConnectionsFailures \
  --namespace AWS/DocDB \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

### Step 3: Enable X-Ray Tracing

Add to task definition:

```json
{
  "containerDefinitions": [
    {
      "name": "xray-daemon",
      "image": "amazon/aws-xray-daemon",
      "cpu": 32,
      "memoryReservation": 256,
      "portMappings": [
        {
          "containerPort": 2000,
          "protocol": "udp"
        }
      ]
    }
  ]
}
```

---

## 🚀 CI/CD Pipeline

### Option 1: AWS CodePipeline

Create `buildspec.yml` in backend directory:

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO_URI
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}
  build:
    commands:
      - echo Build started on `date`
      - echo Building Docker image...
      - docker build -t $ECR_REPO_URI:latest .
      - docker tag $ECR_REPO_URI:latest $ECR_REPO_URI:$IMAGE_TAG
  post_build:
    commands:
      - echo Build completed on `date`
      - echo Pushing Docker images...
      - docker push $ECR_REPO_URI:latest
      - docker push $ECR_REPO_URI:$IMAGE_TAG
      - echo Writing image definitions file...
      - printf '[{"name":"jr-fleet-backend","imageUri":"%s"}]' $ECR_REPO_URI:$IMAGE_TAG > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
```

Create pipeline:

```bash
# Create CodeBuild project
aws codebuild create-project \
  --name jr-fleet-backend-build \
  --source type=GITHUB,location=https://github.com/yourusername/jr-fleet.git \
  --artifacts type=NO_ARTIFACTS \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/standard:5.0,computeType=BUILD_GENERAL1_SMALL \
  --service-role arn:aws:iam::YOUR_ACCOUNT_ID:role/CodeBuildServiceRole

# Create CodePipeline
aws codepipeline create-pipeline --cli-input-json file://pipeline-config.json
```

### Option 2: GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: jr-fleet-backend
          IMAGE_TAG: ${{ github.sha }}
        run: |
          cd backend
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster jr-fleet-cluster \
            --service jr-fleet-backend-service \
            --force-new-deployment

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd frontend
          npm ci

      - name: Build
        env:
          REACT_APP_API_URL: https://api.jrfleetsolutions.com
        run: |
          cd frontend
          npm run build

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy to S3
        run: |
          cd frontend
          aws s3 sync build/ s3://jr-fleet-frontend/ --delete

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

---

## 💰 Cost Optimization

### Estimated Monthly Costs (Production)

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **ECS Fargate** | 2 tasks (1vCPU, 2GB) | ~$60 |
| **DocumentDB** | db.r5.large (Multi-AZ) | ~$400 |
| **ElastiCache Redis** | cache.t3.medium | ~$50 |
| **ALB** | 1 load balancer | ~$20 |
| **S3** | 100GB storage + requests | ~$15 |
| **CloudFront** | 1TB data transfer | ~$85 |
| **Route 53** | 2 hosted zones | ~$1 |
| **NAT Gateway** | 1 gateway | ~$35 |
| **Data Transfer** | Out to internet | ~$50 |
| **CloudWatch** | Logs & metrics | ~$20 |
| **Secrets Manager** | 2 secrets | ~$1 |
| **Certificate Manager** | Free | $0 |
| **Total** | | **~$737/month** |

### Cost Optimization Strategies

1. **Use Fargate Spot for non-production**
   ```bash
   # Update capacity provider strategy
   --capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=1,base=1
   ```

2. **Enable S3 Intelligent-Tiering**
   ```bash
   aws s3api put-bucket-intelligent-tiering-configuration \
     --bucket jr-fleet-documents \
     --id EntireDocumentBucket \
     --intelligent-tiering-configuration file://intelligent-tiering.json
   ```

3. **Use Reserved Instances for DocumentDB** (1-year commitment saves 30%)

4. **Implement CloudFront caching** (reduce backend requests)

5. **Use S3 lifecycle policies**
   ```bash
   aws s3api put-bucket-lifecycle-configuration \
     --bucket jr-fleet-documents \
| **ECS Fargate** | 2 tasks (1vCPU, 2GB) | ~$60 |
| **DocumentDB** | db.r5.large (Multi-AZ) | ~$400 |
| **ElastiCache Redis** | cache.t3.medium | ~$50 |
| **ALB** | 1 load balancer | ~$20 |
| **S3** | 100GB storage + requests | ~$15 |
| **CloudFront** | 1TB data transfer | ~$85 |
| **Route 53** | 1 hosted zone | ~$0.50 |
| **NAT Gateway** | 1 gateway | ~$35 |
| **Data Transfer** | Out to internet | ~$50 |
| **CloudWatch** | Logs & metrics | ~$20 |
| **Secrets Manager** | 2 secrets | ~$1 |
| **Certificate Manager** | Free | $0 |
| **Total** | | **~$736.50/month** |
aws logs tail /ecs/jr-fleet-backend --follow
```

**Common causes:**
- Insufficient memory/CPU
- Secrets Manager access denied
- Container health check failing
- Network connectivity issues

#### 2. Database Connection Errors

**Verify security group:**
```bash
aws ec2 describe-security-groups --group-ids $DOCDB_SG_ID
```

**Test connection from ECS task:**
```bash
aws ecs execute-command \
  --cluster jr-fleet-cluster \
  --task TASK_ID \
  --container jr-fleet-backend \
  --interactive \
  --command "/bin/bash"

# Inside container:
mongo --host jr-fleet-docdb-cluster.cluster-xxxxx.us-east-1.docdb.amazonaws.com:27017 \
  --username admin \
  --password
```

#### 3. CloudFront Not Serving Updated Content

**Invalidate cache:**
```bash
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"
```

#### 4. ALB Health Checks Failing

**Check target health:**
```bash
aws elbv2 describe-target-health \
  --target-group-arn $TG_ARN
```

**Verify health check endpoint:**
```bash
curl http://ALB_DNS_NAME/health
```

### Debugging Commands

```bash
# View ECS service events
aws ecs describe-services \
  --cluster jr-fleet-cluster \
  --services jr-fleet-backend-service

# Check task status
aws ecs list-tasks --cluster jr-fleet-cluster
aws ecs describe-tasks --cluster jr-fleet-cluster --tasks TASK_ARN

# View CloudWatch logs
aws logs tail /ecs/jr-fleet-backend --follow --since 30m

# Check DocumentDB cluster status
aws docdb describe-db-clusters \
  --db-cluster-identifier jr-fleet-docdb-cluster

# View ALB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=app/jr-fleet-alb/... \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

---

## 📝 Post-Deployment Checklist

- [ ] DNS records configured (A/AAAA/CNAME)
- [ ] SSL certificates validated and applied
- [ ] CloudFront distributions active
- [ ] ECS services running and healthy
- [ ] Database accessible from backend
- [ ] Redis cache operational
- [ ] S3 buckets configured with correct permissions
- [ ] WAF rules active
- [ ] CloudWatch alarms configured
- [ ] Backup policies enabled
- [ ] Auto-scaling configured
- [ ] CI/CD pipeline tested
- [ ] Load testing completed
- [ ] Security audit performed
- [ ] Documentation updated

---

## 🔐 Environment Variables Reference

### Backend Environment Variables

```bash
# Database
MONGODB_URI=mongodb://admin:pass@endpoint:27017/fleet_db?ssl=true
DATABASE_NAME=fleet_management

# Authentication
JWT_SECRET_KEY=your-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# AI Services
GEMINI_API_KEY=your-gemini-key
HUGGINGFACE_TOKEN=your-hf-token

# AWS Services
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
S3_BUCKET_NAME=jr-fleet-documents

# Cache
REDIS_URL=redis://endpoint:6379

# Email (Resend — see backend/email_service.py)
RESEND_API_KEY=your-resend-api-key
SENDER_EMAIL=noreply@jrfleetsolutions.com

# Application
ENVIRONMENT=production
LOG_LEVEL=INFO
CORS_ORIGINS=https://app.jrfleetsolutions.com,https://jrfleetsolutions.com
```

### Frontend Environment Variables

```bash
# API Configuration
REACT_APP_API_URL=https://api.jrfleetsolutions.com
REACT_APP_ENVIRONMENT=production

# Feature Flags
REACT_APP_ENABLE_ANALYTICS=true
REACT_APP_ENABLE_AI_FEATURES=true

# Google Services (if used)
REACT_APP_GOOGLE_MAPS_API_KEY=your-key
```

---

## 📚 Additional Resources

- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [AWS DocumentDB Guide](https://docs.aws.amazon.com/documentdb/)
- [CloudFront Developer Guide](https://docs.aws.amazon.com/cloudfront/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [FastAPI Deployment Guide](https://fastapi.tiangolo.com/deployment/)
- [React Production Build](https://create-react-app.dev/docs/production-build/)

---

## 🆘 Support & Maintenance

### Regular Maintenance Tasks

**Daily:**
- Monitor CloudWatch dashboards
- Check ECS task health
- Review application logs

**Weekly:**
- Review cost and usage reports
- Check security advisories
- Analyze performance metrics
- Review backup logs

**Monthly:**
- Update dependencies
- Rotate access keys
- Review IAM permissions
- Conduct security audit
- Optimize costs

### Emergency Contacts

- **AWS Support:** [AWS Console Support](https://console.aws.amazon.com/support/)
- **Technical Team:** devops@jrfleetsolutions.com
- **On-Call Rotation:** [PagerDuty/Opsgenie]

---

## 🎯 Next Steps

1. **Implement monitoring dashboards**
2. **Set up automated backups**
3. **Configure disaster recovery**
4. **Implement blue-green deployments**
5. **Set up staging environment**
6. **Confirm Resend domain and `SENDER_EMAIL` for production**
7. **Implement rate limiting**
8. **Set up API documentation (Swagger)**
9. **Configure log aggregation**
10. **Implement feature flags**

---

**Document Version:** 1.0.0  
**Last Updated:** February 2, 2026  
**Maintained By:** JR Fleet Solutions DevOps Team

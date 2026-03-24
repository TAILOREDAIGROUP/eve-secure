# EVE Secure Infrastructure as Code

Complete infrastructure-as-code setup for EVE Secure with AWS and Docker configurations.

## Files Created

### Pulumi Infrastructure (AWS)

- **`infra/pulumi/index.ts`** (687 lines)
  - AWS VPC with public/private subnets across 3 AZs (production) or 2 AZs (staging)
  - KMS keys for encryption (app data, audit trail, backups) with automatic rotation
  - S3 buckets:
    - App data: SSE-KMS encryption, versioning enabled
    - Audit trail: Object Lock compliance mode (7 years retention for production, 90 days for staging)
    - Backups: Cross-region replication support
  - ECS Fargate cluster with auto-scaling
  - ElastiCache Redis (7.0) for session deny-list and rate limiting
  - IAM roles with least-privilege access patterns
  - CloudWatch log groups with KMS encryption
  - Lambda functions:
    - PDF generation (React-PDF, Node.js 20, VPC-isolated, no internet)
    - ClamAV virus scanning (Node.js 20, VPC-isolated)
  - Application Load Balancer with health checks
  - Secrets Manager for all sensitive data

- **`infra/pulumi/Pulumi.yaml`**
  - Project metadata and default configuration
  - Runtime: Node.js
  - Default environment: local

- **`infra/pulumi/Pulumi.staging.yaml`**
  - Staging stack configuration
  - 2x ECS tasks (512 CPU, 1 GB memory each)
  - RDS: db.t3.small with 100 GB storage
  - Redis: Single-node cache.t3.micro
  - Log retention: 30 days

- **`infra/pulumi/Pulumi.production.yaml`**
  - Production stack configuration
  - 3x ECS tasks (1024 CPU, 2 GB memory each)
  - RDS: db.r6i.xlarge with 500 GB storage, Multi-AZ, 30-day backups
  - Redis: 3-node cache.r6g.xlarge with automatic failover
  - Log retention: 90 days
  - MFA Delete enabled for S3

### Docker Configuration

- **`infra/docker/docker-compose.yml`** (122 lines)
  - PostgreSQL 16 with pgvector extension
  - Redis 7 with authentication and persistence
  - ClamAV latest for virus scanning
  - Node.js API service with hot reload
  - Health checks for all services
  - Volume persistence (postgres_data, redis_data, clamav_data)
  - Shared network: eve-secure-net

- **`infra/docker/Dockerfile`**
  - Multi-stage build for optimized image size
  - Node.js 20 Alpine base
  - Non-root user (nodejs:1001)
  - Security: Read-only filesystem with writable /tmp
  - Health check: HTTP /health endpoint
  - dumb-init for proper signal handling

- **`infra/docker/Dockerfile.lambda-pdf`**
  - Node.js 20 Alpine
  - React-PDF and related dependencies
  - VPC isolation enforced by Pulumi config (no NAT Gateway)

### CI/CD Workflows

- **`.github/workflows/ci.yml`** (367 lines)
  - PR checks:
    - ESLint and TypeScript type checking
    - Unit tests with coverage
    - Evaluation tests (injection, harm, isolation)
    - Snyk security scanning
    - Docker build cache testing
  - Merge to main:
    - Full test suite execution
    - Docker image build and push to ECR
    - Deploy to staging automatically
    - SBOM generation (CycloneDX)
  - Manual production deployment:
    - Requires all evaluations passing
    - Infrastructure update with Pulumi
    - ECS service redeployment

- **`.github/workflows/eval-cron.yml`**
  - Weekly schedule: Monday 2 AM UTC
  - Full E1-E8 evaluation suite
  - Results pushed to Grafana dashboard
  - Regression detection with alerts
  - Slack notifications

- **`.github/dependabot.yml`**
  - NPM: Daily updates, auto-merge patch updates to production
  - GitHub Actions: Weekly updates
  - Docker: Weekly base image updates
  - All pull requests reviewed by designated teams

### Deployment Scripts

- **`scripts/setup-local.sh`** (executable)
  - Validates Node.js 20+, npm, Docker, Docker Compose
  - Generates secure environment variables
  - Starts Docker Compose services
  - Runs database migrations and seeds
  - Builds TypeScript
  - Provides instructions for next steps

- **`scripts/deploy.sh`** (executable)
  - Supports staging and production environments
  - Pre-deployment checks and tests
  - Database and S3 bucket backups
  - Pulumi infrastructure deployment
  - ECS service redeployment
  - Health check verification
  - Git deployment tagging
  - Options: --dry-run, --skip-tests, --skip-backup, --skip-checks

## Architecture Highlights

### Security

- **Encryption in Transit**: TLS 1.2+ for all services
- **Encryption at Rest**: KMS-managed SSE-S3 for all S3 buckets
- **Audit Trail**: S3 Object Lock (compliance mode) for immutable audit logs
- **Network Isolation**: Private subnets for Lambda functions (no NAT Gateway)
- **Secrets Management**: AWS Secrets Manager with automatic rotation support
- **Access Control**: IAM roles with principle of least privilege

### High Availability (Production)

- **Multi-AZ Deployment**: ECS tasks and RDS across 3 availability zones
- **Load Balancing**: Application Load Balancer with health checks
- **Redis Clustering**: 3-node cluster with automatic failover
- **RDS**: Multi-AZ with automated backups
- **Auto-scaling**: ECS auto-scaling policies based on CPU/memory

### Compliance & Audit

- **Audit Logs**: Immutable S3 bucket with 7-year retention (production)
- **CloudWatch Logs**: Centralized logging with KMS encryption
- **Version Control**: S3 versioning for data recovery
- **Deployment Tracking**: Git tags for each deployment
- **Evaluation Suite**: Weekly automated security evaluations

## Environment Variables Required

### Local Development (.env.local)
```
DB_PASSWORD=[auto-generated]
REDIS_PASSWORD=[auto-generated]
JWT_SECRET=[auto-generated]
ENCRYPTION_KEY=[auto-generated]
NODE_ENV=development
LOG_LEVEL=debug
```

### AWS Deployment
- `PULUMI_ACCESS_TOKEN`: Pulumi state backend access
- `AWS_ROLE_TO_ASSUME`: Cross-account deployment role
- `SNYK_TOKEN`: Security scanning token
- `GRAFANA_URL`: Metrics dashboard endpoint
- `GRAFANA_API_TOKEN`: Grafana authentication
- `SLACK_WEBHOOK_URL`: Notification channel

## Quick Start

### Local Development
```bash
./scripts/setup-local.sh
npm run dev
```

### Deploy to Staging
```bash
./scripts/deploy.sh --environment staging
```

### Deploy to Production (Manual + Review)
```bash
./scripts/deploy.sh --environment production --version v1.0.0
```

### Dry-run Deployment
```bash
./scripts/deploy.sh --environment production --dry-run
```

## Key Features

- **Development**: Full Docker stack for local testing
- **Staging**: Single-instance RDS/Redis with 30-day log retention
- **Production**: Multi-AZ, auto-scaling with 90-day retention
- **CI/CD**: Automated testing, security scanning, and deployment
- **Monitoring**: CloudWatch metrics and Grafana dashboards
- **Compliance**: Immutable audit trails and evaluation testing

## Pulumi Stack Management

```bash
cd infra/pulumi

# Initialize stack
pulumi stack init eve-secure-staging
pulumi stack select eve-secure-staging

# Deploy
pulumi up

# View outputs
pulumi stack output

# Destroy (use with caution)
pulumi destroy
```

## Testing

```bash
# Unit tests
npm run test:unit

# Evaluation tests (injection, harm, isolation)
npm run test:eval:injection
npm run test:eval:harm
npm run test:eval:isolation

# All tests
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Monitoring & Alerts

- CloudWatch dashboards for API performance
- Lambda function monitoring (duration, errors, cold starts)
- Redis cluster health checks
- RDS performance insights
- ECS task and service metrics
- S3 bucket size and object count monitoring

## Backup & Recovery

- Automated RDS snapshots (daily, 30-day retention)
- S3 versioning for accidental deletion recovery
- S3 Object Lock prevents audit log deletion
- Pre-deployment backup script for safe deployments
- Cross-region backup replication support

## Next Steps

1. Configure AWS credentials: `aws configure`
2. Set up Pulumi: `pulumi login`
3. Deploy infrastructure: `./scripts/deploy.sh --environment staging`
4. Monitor deployment: `pulumi logs -f`
5. Access application: ALB DNS name from Pulumi outputs

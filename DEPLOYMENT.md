# PubFlow AI - Deployment Guide

Complete guide for deploying PubFlow AI to various environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (Docker)](#quick-start-docker)
- [Production Deployment](#production-deployment)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Monitoring & Observability](#monitoring--observability)
- [Scaling](#scaling)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- Docker 24+ and Docker Compose 2.x
- Node.js 20+ (for local development)
- PostgreSQL 16+ with pgvector extension
- Redis 7+

### Required Accounts/API Keys

- OpenAI API key (for AI features)
- (Optional) Sentry DSN for error tracking
- (Optional) SMTP credentials for email

---

## Quick Start (Docker)

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/your-org/pubflow-ai.git
cd pubflow-ai

# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env

# Edit .env with your configuration
nano .env
```

### 2. Generate Secrets

```bash
# Generate JWT secrets
openssl rand -base64 32  # Use for JWT_SECRET
openssl rand -base64 32  # Use for JWT_REFRESH_SECRET

# Generate database password
openssl rand -base64 24
```

### 3. Start Services

```bash
# Development mode (with hot reload)
docker compose up -d

# Production mode (with nginx, pgbouncer)
docker compose --profile production up -d

# With AI workers
docker compose --profile workers up -d

# With monitoring (Bull Board)
docker compose --profile monitoring up -d
```

### 4. Verify Deployment

```bash
# Check service health
curl http://localhost:3001/health

# Check detailed health
curl http://localhost:3001/health/detailed

# View logs
docker compose logs -f backend
```

---

## Production Deployment

### Option 1: Docker Compose (Single Server)

Best for small to medium deployments.

```bash
# Create production environment
cp .env.example .env.production
# Edit with production values

# Deploy with production profile
docker compose \
  --env-file .env.production \
  --profile production \
  --profile workers \
  up -d
```

### Option 2: Kubernetes

For scalable, enterprise deployments.

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/ingress.yaml
```

### Option 3: Cloud Platforms

#### AWS (ECS/Fargate)

```bash
# Build and push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REPO
docker build -t pubflow-backend --target backend .
docker tag pubflow-backend:latest $ECR_REPO/pubflow-backend:latest
docker push $ECR_REPO/pubflow-backend:latest

# Deploy with ECS CLI or Terraform
```

#### Google Cloud (Cloud Run)

```bash
# Build with Cloud Build
gcloud builds submit --config=cloudbuild.yaml

# Deploy
gcloud run deploy pubflow-backend \
  --image gcr.io/$PROJECT_ID/pubflow-backend \
  --platform managed \
  --region us-central1
```

#### Railway (Recommended for MVP)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and initialize
cd pubflow-ai/backend
railway login
railway init

# Add services
railway add --plugin postgresql
railway add --plugin redis

# Enable pgvector extension (in Railway shell)
railway connect postgresql
# Then run: CREATE EXTENSION vector;

# Set environment variables in Railway dashboard:
# - JWT_SECRET (generate: openssl rand -hex 32)
# - JWT_REFRESH_SECRET (generate: openssl rand -hex 32)
# - OPENAI_API_KEY
# - NODE_ENV=production
# - CORS_ORIGIN=https://your-frontend.vercel.app

# Deploy
railway up

# Run migrations and seed
railway run npm run db:migrate
railway run npm run db:seed

# Get your URL
railway domain
```

**Demo credentials after seeding:**
- Email: demo@pubflow.ai
- Password: demo1234

#### Render

---

## Environment Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_PASSWORD` | PostgreSQL password | `secure_password_here` |
| `JWT_SECRET` | JWT signing secret (32+ chars) | `your_jwt_secret_key` |
| `JWT_REFRESH_SECRET` | Refresh token secret | `your_refresh_secret` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `SENTRY_DSN` | Error tracking | - |
| `WORKER_CONCURRENCY` | AI worker parallelism | `3` |

See `backend/.env.example` for full list.

---

## Database Setup

### Initial Setup

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U pubflow -d pubflow

# Verify pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

# Run migrations (automatic on startup, or manual)
docker compose exec backend npm run migrate
```

### Backups

```bash
# Create backup
docker compose exec postgres pg_dump -U pubflow pubflow > backup_$(date +%Y%m%d).sql

# Restore backup
cat backup.sql | docker compose exec -T postgres psql -U pubflow pubflow
```

### Connection Pooling (Production)

PgBouncer is included in the production profile:

```bash
# Connect via PgBouncer (port 6432)
docker compose --profile production up pgbouncer -d

# Update backend to use PgBouncer
DATABASE_URL=postgresql://pubflow:password@pgbouncer:6432/pubflow
```

---

## SSL/TLS Configuration

### Option 1: Let's Encrypt with Certbot

```bash
# Create nginx directory structure
mkdir -p nginx/ssl nginx/conf.d

# Generate certificates
docker run -it --rm \
  -v $(pwd)/nginx/ssl:/etc/letsencrypt \
  certbot/certbot certonly \
  --standalone \
  -d pubflow.ai \
  -d api.pubflow.ai

# Configure nginx (see nginx/nginx.conf)
```

### Option 2: Self-Signed (Development)

```bash
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout nginx/ssl/privkey.pem \
  -out nginx/ssl/fullchain.pem \
  -subj "/CN=localhost"
```

### Nginx Configuration

```nginx
# nginx/conf.d/default.conf
server {
    listen 443 ssl http2;
    server_name pubflow.ai;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    location / {
        proxy_pass http://frontend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Monitoring & Observability

### Health Endpoints

| Endpoint | Description | Use Case |
|----------|-------------|----------|
| `/health` | Basic health check | Load balancer |
| `/health/detailed` | Full service status | Monitoring |
| `/ready` | Readiness probe | Kubernetes |
| `/live` | Liveness probe | Kubernetes |
| `/metrics` | Application metrics | Monitoring |
| `/metrics/prometheus` | Prometheus format | Prometheus |

### Prometheus + Grafana

```yaml
# Add to docker-compose.override.yml
prometheus:
  image: prom/prometheus
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
  ports:
    - "9090:9090"

grafana:
  image: grafana/grafana
  ports:
    - "3003:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
```

### Sentry Error Tracking

1. Create a Sentry project at sentry.io
2. Add DSN to environment:
   ```
   SENTRY_DSN=https://xxx@sentry.io/xxx
   ```
3. Errors will be automatically captured

### Log Aggregation

```bash
# View aggregated logs
docker compose logs -f --tail=100

# JSON logs for production (pipe to ELK/Loki)
LOG_FORMAT=json docker compose up -d
```

---

## Scaling

### Horizontal Scaling

```yaml
# docker-compose.override.yml
services:
  backend:
    deploy:
      replicas: 3

  ai-worker:
    deploy:
      replicas: 2
```

### Database Scaling

- **Read Replicas**: Configure PostgreSQL streaming replication
- **Connection Pooling**: Use PgBouncer (included)
- **Partitioning**: Partition large tables by tenant_id

### Redis Scaling

- **Cluster Mode**: For high availability
- **Separate Instances**: Cache vs. queue separation

---

## Troubleshooting

### Common Issues

#### Database Connection Refused

```bash
# Check postgres is running
docker compose ps postgres

# Check logs
docker compose logs postgres

# Verify network
docker compose exec backend ping postgres
```

#### AI Worker Not Processing

```bash
# Check worker status
docker compose logs ai-worker

# Check Redis connection
docker compose exec redis redis-cli ping

# Check pending tasks
docker compose exec postgres psql -U pubflow -c "SELECT COUNT(*) FROM ai_tasks WHERE status='PENDING'"
```

#### Memory Issues

```bash
# Check container resources
docker stats

# Increase memory limits in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 4G
```

#### Slow Queries

```bash
# Enable query logging
docker compose exec postgres psql -U pubflow -c "ALTER SYSTEM SET log_min_duration_statement = 1000"
docker compose exec postgres psql -U pubflow -c "SELECT pg_reload_conf()"

# Check slow query log
docker compose logs postgres | grep duration
```

### Getting Help

- Check `/health/detailed` for service status
- Review logs: `docker compose logs -f`
- GitHub Issues: [link to issues]
- Documentation: [link to docs]

---

## Security Checklist

- [ ] Change all default passwords
- [ ] Use strong JWT secrets (32+ characters)
- [ ] Enable SSL/TLS in production
- [ ] Configure firewall rules
- [ ] Set up backup procedures
- [ ] Enable Sentry error tracking
- [ ] Review CORS origins
- [ ] Enable rate limiting
- [ ] Set up monitoring alerts

---

## Maintenance

### Updates

```bash
# Pull latest images
docker compose pull

# Restart with new images
docker compose up -d

# Run migrations if needed
docker compose exec backend npm run migrate
```

### Cleanup

```bash
# Remove unused images
docker image prune -a

# Remove unused volumes (CAREFUL!)
docker volume prune
```

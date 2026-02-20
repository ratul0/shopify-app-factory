# Deployment — Fly.io

Multi-stage Docker build, Fly.io configuration, secrets, and scaling for Shopify apps.

## Dockerfile

```dockerfile
# Multi-stage build optimized for Shopify apps with Prisma
FROM node:20-alpine AS base
RUN apk add --no-cache openssl

# --- Build Stage ---
FROM base AS build
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies (layer cached unless package files change)
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

# Copy source and build
COPY . .
RUN npx prisma generate
RUN npm run build

# --- Production Stage ---
FROM base AS production
WORKDIR /app
ENV NODE_ENV=production

# Copy only production artifacts
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

# Run migrations on startup, then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && npm run docker-start"]
```

**For apps with a worker process**, add a second Dockerfile or use the same image with different CMD:

```dockerfile
# Dockerfile.worker (or use fly.toml process groups)
FROM node:20-alpine AS base
RUN apk add --no-cache openssl

FROM base AS build
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/app ./app

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx app/worker.server.ts"]
```

## fly.toml — Web Only

```toml
app = "my-shopify-app"
primary_region = "iad"  # US East (closest to Shopify)

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

[checks]
  [checks.health]
    port = 3000
    type = "http"
    interval = "30s"
    timeout = "5s"
    path = "/"
    method = "GET"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

## fly.toml — Web + Worker (Process Groups)

```toml
app = "my-shopify-app"
primary_region = "iad"

[build]

# Web process
[processes]
  web = "sh -c 'npx prisma migrate deploy && npm run docker-start'"
  worker = "npx tsx app/worker.server.ts"

# Web HTTP service
[[services]]
  internal_port = 3000
  protocol = "tcp"
  processes = ["web"]

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [[services.http_checks]]
    interval = "30s"
    timeout = "5s"
    path = "/"
    method = "GET"

# Worker health check
[[services]]
  internal_port = 3001
  protocol = "tcp"
  processes = ["worker"]

  [[services.http_checks]]
    interval = "30s"
    timeout = "10s"
    path = "/healthz"
    method = "GET"

# VM config per process
[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
  processes = ["web"]

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
  processes = ["worker"]
```

## Deployment Steps

### 1. Create Fly App

```bash
fly apps create my-shopify-app
```

### 2. Provision Database

**Option A: Fly Postgres**
```bash
fly postgres create --name my-shopify-app-db --region iad --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
fly postgres attach my-shopify-app-db --app my-shopify-app
# This auto-sets DATABASE_URL
```

**Option B: External Postgres (Supabase, Neon, etc.)**
```bash
fly secrets set DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"
```

### 3. Provision Redis

**Option A: Upstash Redis (recommended for BullMQ)**
```bash
fly secrets set REDIS_URL="rediss://default:password@host:6379"
```

**Option B: Fly Redis**
```bash
fly redis create --name my-shopify-app-redis --region iad --plan free
# Note the connection URL
fly secrets set REDIS_URL="redis://default:password@fly-my-shopify-app-redis.upstash.io:6379"
```

### 4. Set Secrets

```bash
# Shopify (these come from Partners Dashboard)
fly secrets set \
  SHOPIFY_API_KEY="your_api_key" \
  SHOPIFY_API_SECRET="your_api_secret" \
  SCOPES="read_products,write_files"

# Storage (Cloudflare R2 or AWS S3)
fly secrets set \
  S3_ENDPOINT="https://account-id.r2.cloudflarestorage.com" \
  S3_ACCESS_KEY_ID="your_key" \
  S3_SECRET_ACCESS_KEY="your_secret" \
  S3_BUCKET_NAME="app-uploads" \
  S3_PUBLIC_URL="https://pub-xxx.r2.dev" \
  S3_REGION="auto"

# App-specific
fly secrets set AI_API_KEY="your_key"
```

### 5. Deploy

```bash
fly deploy
```

### 6. Update Shopify App URL

In the Shopify Partners Dashboard:
1. Go to Apps → Your App → Configuration
2. Set **App URL** to `https://my-shopify-app.fly.dev/`
3. Set **Allowed redirection URLs** to `https://my-shopify-app.fly.dev/auth/callback`

Or use CLI:
```bash
shopify app config link
# Update shopify.app.toml with production URL
shopify app deploy
```

## Scaling

### Horizontal Web Scaling

```bash
fly scale count web=2 --region iad
```

The web tier is stateless (all state in Postgres/Redis/S3), so horizontal scaling works out of the box.

### Worker Scaling

```bash
fly scale count worker=2 --region iad
```

BullMQ distributes jobs across workers automatically. The atomic claim pattern prevents double-processing.

### Region Selection

Choose `iad` (US East) for most Shopify apps — it's closest to Shopify's servers. If your users are primarily in Europe, consider `cdg` (Paris) or `lhr` (London).

## Health Checks

### Web Process

The default React Router app responds to `GET /` with the auth redirect. For a dedicated health endpoint:

```typescript
// app/routes/healthz.tsx
export const loader = async () => {
  // Check database connection
  await prisma.$queryRaw`SELECT 1`;
  return json({ status: "ok" });
};
```

### Worker Process

The worker template includes a built-in health check server on `WORKER_HEALTH_PORT` (default 3001). See `references/background-jobs.md`.

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Prisma migration fails | Database not attached | Run `fly postgres attach` first |
| `SHOPIFY_APP_URL` not set | Missing in secrets | Set via `fly secrets set` |
| Worker can't connect to Redis | Wrong Redis URL format | Ensure `rediss://` for TLS |
| S3 uploads fail | Missing bucket or credentials | Verify with `aws s3 ls --endpoint-url` |
| App shows "App not installed" | Wrong App URL in Partners Dashboard | Update to match Fly domain |

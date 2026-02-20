# Stack Blueprint

Default dependencies, file structure, configs, and Docker Compose for a new Shopify app.

## Dependencies

### Core (always required)

```json
{
  "dependencies": {
    "@shopify/shopify-app-react-router": "^1.1.0",
    "@shopify/shopify-app-session-storage-prisma": "^5.0.0",
    "@shopify/shopify-api": "^12.0.0",
    "@prisma/client": "^6.0.0",
    "react-router": "^7.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "isbot": "^5.0.0"
  },
  "devDependencies": {
    "@react-router/dev": "^7.0.0",
    "@shopify/app": "^3.0.0",
    "@shopify/cli": "^3.0.0",
    "@types/react": "^19.0.0",
    "prisma": "^6.0.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "vite-tsconfig-paths": "^5.0.0"
  }
}
```

### Background Jobs (when async processing needed)

```json
{
  "dependencies": {
    "bullmq": "^5.0.0"
  }
}
```

### File Storage (when file upload/storage needed)

```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0",
    "busboy": "^1.6.0"
  },
  "devDependencies": {
    "@types/busboy": "^1.5.0"
  }
}
```

### AI Features (when AI processing needed)

```json
{
  "dependencies": {
    "ai": "^4.0.0",
    "@ai-sdk/google": "^3.0.0"
  }
}
```

Swap `@ai-sdk/google` for `@ai-sdk/openai`, `@ai-sdk/anthropic`, etc. based on the chosen provider.

## Scripts

```json
{
  "scripts": {
    "build": "react-router build",
    "dev": "shopify app dev",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc",
    "lint": "eslint app/",
    "worker": "tsx app/worker.server.ts",
    "setup": "prisma generate && prisma migrate deploy",
    "docker-start": "npm run setup && npm run start"
  }
}
```

## Vite Configuration

```typescript
// vite.config.ts
import { defineConfig, type UserConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import tsconfigPaths from "vite-tsconfig-paths";

const host = new URL(
  process.env.SHOPIFY_APP_URL || "http://localhost",
).hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: { port: Number(process.env.PORT || 3000), hmr: hmrConfig, fs: { allow: ["app", "node_modules"] } },
  plugins: [reactRouter(), tsconfigPaths()],
  build: { assetsInlineLimit: 0 },
}) satisfies UserConfig;
```

## Docker Compose (Local Development)

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: apppass
      POSTGRES_DB: appdb
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 10s
      timeout: 5s
      retries: 3

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data

  # Auto-create the default bucket on first run
  minio-setup:
    image: minio/mc
    depends_on:
      minio:
        condition: service_started
    entrypoint: >
      /bin/sh -c "
      sleep 3;
      mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb local/app-uploads --ignore-existing;
      mc anonymous set download local/app-uploads;
      "

volumes:
  pgdata:
  minio-data:
```

Remove the `redis` service if no background jobs are needed.
Remove `minio` and `minio-setup` if no file storage is needed.

## Environment Template

```env
# .env.example

# Database
DATABASE_URL=postgresql://appuser:apppass@localhost:5432/appdb

# Redis (required if using background jobs)
REDIS_URL=redis://localhost:6379

# S3-compatible storage (required if using file uploads)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=app-uploads
S3_PUBLIC_URL=http://localhost:9000/app-uploads
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true

# Worker health check (required if using background jobs)
WORKER_HEALTH_PORT=3001

# App-specific (add your own)
# AI_API_KEY=your_key_here
```

## Worker Process Config

```toml
# worker/shopify.web.toml
name = "BullMQ Worker"
roles = ["background"]

[commands]
dev = "sh run.sh"
```

```bash
#!/bin/sh
# worker/run.sh
# Resolve tsx from the parent node_modules
WORKER_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$WORKER_DIR")"
TSX_BIN="$PROJECT_ROOT/node_modules/.bin/tsx"

exec "$TSX_BIN" "$PROJECT_ROOT/app/worker.server.ts"
```

## Prisma Client Singleton

```typescript
// app/db.server.ts
import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

const prisma: PrismaClient =
  globalThis.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
```

## S3 Client Setup

```typescript
// app/services/storage.server.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

function createS3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : undefined);

  if (!endpoint) throw new Error("S3_ENDPOINT or R2_ACCOUNT_ID required");

  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || "",
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });
}

const s3 = createS3Client();
const bucket = process.env.S3_BUCKET_NAME || "app-uploads";
const publicUrl = process.env.S3_PUBLIC_URL || "";

export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${publicUrl}/${key}`;
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
```

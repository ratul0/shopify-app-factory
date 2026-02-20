# Background Jobs

BullMQ + Redis patterns for async processing in Shopify apps.

## When to Use Background Jobs

Use background jobs when:
- Processing takes > 5 seconds (Shopify proxy times out at 10s)
- Work is triggered by webhooks that need instant acknowledgment
- Operations can fail and need retry logic
- Rate-limited external API calls need throttling
- Bulk operations process many items sequentially

## Queue Setup

```typescript
// app/services/queue.server.ts
import type { RedisOptions, Queue } from "bullmq";

export interface JobData {
  jobId: string;
  shopDomain: string;
  shopId: string;
  // Add job-specific fields
}

export function parseRedisUrl(redisUrl: string): RedisOptions {
  const parsed = new URL(redisUrl);
  const dbPath = parsed.pathname.replace(/^\//, "");
  const db = dbPath ? parseInt(dbPath, 10) : undefined;
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db: Number.isNaN(db) ? undefined : db,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

// Lazy singleton — prevents multiple queue instances in dev (HMR)
let _initPromise: Promise<Queue<JobData>> | null = null;

function initQueue(): Promise<Queue<JobData>> {
  if (_initPromise) return _initPromise;

  _initPromise = import("bullmq").then(({ Queue }) => {
    return new Queue<JobData>("jobs", {
      connection: parseRedisUrl(process.env.REDIS_URL!),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    });
  });

  return _initPromise;
}

export async function enqueueJob(data: JobData): Promise<string> {
  const queue = await initQueue();
  const job = await queue.add("process", data, {
    jobId: data.jobId, // Prevents duplicate jobs
  });
  return job.id!;
}
```

## Worker Entry Point

```typescript
// app/worker.server.ts
import http from "http";
import { Worker, Queue, UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import prisma from "./db.server";
import { parseRedisUrl } from "./services/queue.server";
import type { JobData } from "./services/queue.server";

// Bridge env var naming: Shopify CLI injects HOST/APP_URL, not SHOPIFY_APP_URL
if (!process.env.SHOPIFY_APP_URL) {
  process.env.SHOPIFY_APP_URL = process.env.APP_URL || process.env.HOST || "";
}

const connection = parseRedisUrl(process.env.REDIS_URL!);

async function processJob(job: Job<JobData>): Promise<void> {
  const { jobId, shopDomain, shopId } = job.data;
  console.log(`Processing job ${jobId} for ${shopDomain}`);

  // Atomic claim — prevents double-processing in multi-worker setup
  const claimed = await prisma.job.updateMany({
    where: { id: jobId, status: { in: ["pending", "retrying"] } },
    data: { status: "processing", updatedAt: new Date() },
  });

  if (claimed.count === 0) {
    console.warn(`Job ${jobId} already claimed by another worker, skipping`);
    return;
  }

  // Lazy import shopify.server.ts — env vars must be set first
  const { unauthenticated } = await import("./shopify.server");
  const { admin } = await unauthenticated.admin(shopDomain);

  try {
    // --- YOUR JOB LOGIC HERE ---
    // Use admin.graphql() for Shopify API calls
    // Use prisma for database operations

    // Mark completed
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "completed", updatedAt: new Date() },
    });
  } catch (error: any) {
    // Non-retryable errors fail immediately
    if (isNonRetryable(error)) {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "failed",
          errorMessage: error.message,
          retryCount: job.attemptsMade,
        },
      });
      throw new UnrecoverableError(error.message);
    }
    throw error; // BullMQ handles retry
  }
}

function isNonRetryable(error: Error): boolean {
  const messages = [
    "Monthly render limit reached",
    "Product not found",
    "Shop not found",
  ];
  return messages.some((m) => error.message.includes(m));
}

// Create worker
const worker = new Worker<JobData>("jobs", processJob, {
  connection,
  concurrency: 2,
  stalledInterval: 120_000,
  maxStalledCount: 2,
  limiter: {
    max: 10,
    duration: 60000,
  },
});

// Error handling
worker.on("failed", async (job, err) => {
  if (!job) return;

  const maxAttempts = job.opts.attempts ?? 3;
  const isFinalAttempt =
    job.attemptsMade >= maxAttempts || err.name === "UnrecoverableError";

  if (isFinalAttempt) {
    await prisma.job.update({
      where: { id: job.data.jobId },
      data: {
        status: "failed",
        errorMessage: err.message,
        retryCount: job.attemptsMade,
      },
    });
    console.error(`Job ${job.data.jobId} permanently failed: ${err.message}`);
  } else {
    await prisma.job.update({
      where: { id: job.data.jobId },
      data: { status: "retrying", retryCount: job.attemptsMade },
    });
    console.warn(
      `Job ${job.data.jobId} attempt ${job.attemptsMade} failed, will retry: ${err.message}`,
    );
  }
});

worker.on("completed", (job) => {
  console.log(`Job ${job.data.jobId} completed successfully`);
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down worker...`);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Health check server
const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || "3001");
const healthQueue = new Queue("jobs", { connection });

const healthServer = http.createServer(async (_req, res) => {
  if (_req.url === "/healthz") {
    try {
      const redisClient = await healthQueue.client;
      await Promise.all([
        prisma.$queryRaw`SELECT 1`,
        redisClient.ping(),
      ]);

      if (worker.closing) {
        res.writeHead(503);
        res.end(JSON.stringify({ status: "shutting_down" }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok" }));
    } catch (error: any) {
      res.writeHead(503);
      res.end(JSON.stringify({ status: "error", message: error.message }));
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(healthPort, () => {
  console.log(`Worker health check on port ${healthPort}`);
});

console.log("Worker started, waiting for jobs...");
```

## Job Creation Pattern

In your route handler (proxy or admin):

```typescript
// app/routes/proxy.process.tsx
import { enqueueJob } from "~/services/queue.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  // Create job record in DB first
  const job = await prisma.job.create({
    data: {
      shopId: shop.id,
      status: "pending",
      // ...other fields
    },
  });

  // Then enqueue — if this fails, the DB record exists but is never processed
  // Better than processing without a record
  try {
    await enqueueJob({
      jobId: job.id,
      shopDomain: session.shop,
      shopId: shop.id,
    });
  } catch (error) {
    // Clean up orphaned job record
    await prisma.job.delete({ where: { id: job.id } }).catch(() => {});
    return json({ error: "Failed to queue job" }, { status: 500 });
  }

  return json({ jobId: job.id, status: "pending" });
};
```

## Status Polling Pattern

```typescript
// app/routes/proxy.status.tsx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (!jobId) return json({ error: "Missing jobId" }, { status: 400 });

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return json({ error: "Job not found" }, { status: 404 });

  return json({
    status: job.status,
    result: job.status === "completed" ? job.result : undefined,
    error: job.status === "failed" ? job.errorMessage : undefined,
  });
};
```

## Worker Shopify CLI Config

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
WORKER_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$WORKER_DIR")"
TSX_BIN="$PROJECT_ROOT/node_modules/.bin/tsx"
exec "$TSX_BIN" "$PROJECT_ROOT/app/worker.server.ts"
```

The `roles = ["background"]` flag tells Shopify CLI to:
1. Start this as a separate process alongside the web server
2. Inject the same environment variables (SHOPIFY_API_KEY, etc.)
3. Not assign a port (workers don't serve HTTP)

## Scaling Considerations

- **Concurrency:** Start with 2, increase based on job complexity and resource usage
- **Rate limiting:** Use BullMQ's built-in limiter to respect API rate limits
- **Stall detection:** Jobs that take > `stalledInterval` get re-queued. Set this higher than your longest job.
- **Multi-worker:** Multiple workers can process the same queue. The atomic claim pattern prevents double-processing.
- **Separate process:** In production on Fly.io, run the worker as a separate machine for independent scaling.

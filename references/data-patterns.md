# Data Patterns

Prisma patterns, product ID normalization, and atomic operations for Shopify apps.

## Product ID Normalization (MANDATORY)

Product IDs exist in three formats across the system:

| Source | Format | Example |
|--------|--------|---------|
| Shopify Admin Resource Picker | GID | `gid://shopify/Product/12345` |
| Storefront JavaScript | Numeric string | `"12345"` |
| Database (varies) | Whatever was stored | Could be any of the above |

**Every product lookup MUST query all three formats:**

```typescript
function findProduct(prisma: PrismaClient, shopId: string, productId: string) {
  const numericId = productId.replace(/\D/g, "");
  const gid = `gid://shopify/Product/${numericId}`;

  return prisma.enabledProduct.findFirst({
    where: {
      shopId,
      OR: [
        { shopifyProductId: productId },
        { shopifyProductId: gid },
        { shopifyProductId: numericId },
      ],
    },
  });
}
```

**Why this matters:** The admin resource picker returns GIDs (`gid://shopify/Product/12345`), but storefront JavaScript only has access to numeric IDs (`"12345"`). If you only query one format, product lookups silently fail and features appear broken with no error message.

**Helper function (add to any app that stores product IDs):**

```typescript
// app/utils/product-id.ts
export function normalizeProductId(productId: string): {
  original: string;
  numeric: string;
  gid: string;
} {
  const numeric = productId.replace(/\D/g, "");
  return {
    original: productId,
    numeric,
    gid: `gid://shopify/Product/${numeric}`,
  };
}

export function productIdWhereClause(shopId: string, productId: string) {
  const { original, numeric, gid } = normalizeProductId(productId);
  return {
    shopId,
    OR: [
      { shopifyProductId: original },
      { shopifyProductId: gid },
      { shopifyProductId: numeric },
    ],
  };
}
```

This pattern applies to ANY Shopify resource ID (orders, customers, collections), not just products.

## Atomic Credit/Limit Operations

**Never do check-then-increment.** Race conditions will cause overdraft.

### Bad Pattern (race condition)

```typescript
// DON'T DO THIS — two requests can pass the check simultaneously
const shop = await prisma.shop.findUnique({ where: { id: shopId } });
if (shop.monthlyUsage < limit) {
  await prisma.shop.update({
    where: { id: shopId },
    data: { monthlyUsage: { increment: 1 } },
  });
}
```

### Good Pattern (atomic single statement)

```typescript
export async function claimUsageSlot(
  shopId: string,
  limit: number,
): Promise<boolean> {
  const now = new Date();

  const result = await prisma.$queryRaw<Array<{ claimed: boolean }>>`
    UPDATE "Shop"
    SET
      "monthlyUsage" = CASE
        WHEN "usageResetAt" < ${now} THEN 1
        ELSE "monthlyUsage" + 1
      END,
      "usageResetAt" = CASE
        WHEN "usageResetAt" < ${now} THEN "usageResetAt" + INTERVAL '1 month'
        ELSE "usageResetAt"
      END,
      "updatedAt" = ${now}
    WHERE "id" = ${shopId}
      AND (
        "usageResetAt" < ${now}
        OR "monthlyUsage" < ${limit}
      )
    RETURNING true AS "claimed"
  `;

  return result.length > 0 && (result[0]?.claimed ?? false);
}
```

**Key properties:**
- Single UPDATE with WHERE condition — no race window
- Monthly reset is atomic with increment
- Returns empty result if limit exceeded (no update performed)
- Call AFTER the expensive operation succeeds (don't charge for failures)

### Plan Limits Pattern

```typescript
const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  growth: 500,
  pro: 2000,
  plus: 10000,
};

// Keep this in sync with admin UI display
```

## Prisma Schema Patterns

### Shop Model (per-tenant config)

```prisma
model Shop {
  id             String           @id @default(cuid())
  shopDomain     String           @unique
  plan           String           @default("free")
  monthlyUsage   Int              @default(0)
  usageResetAt   DateTime         @default(now())
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  // Relations
  enabledProducts EnabledProduct[]
  jobs            Job[]
}
```

### Session Model (required by Shopify)

```prisma
model Session {
  id          String    @id
  shop        String
  state       String
  isOnline    Boolean   @default(false)
  scope       String?
  expires     DateTime?
  accessToken String
  userId      BigInt?

  @@index([shop])
}
```

### Job Model (for background processing)

```prisma
model Job {
  id           String   @id @default(cuid())
  shopId       String
  status       String   @default("pending") // pending|processing|retrying|completed|failed
  errorMessage String?
  retryCount   Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  shop Shop @relation(fields: [shopId], references: [id])

  @@index([shopId, status, createdAt])
  @@index([status])
}
```

### Product-Linked Model

```prisma
model EnabledProduct {
  id               String   @id @default(cuid())
  shopId           String
  shopifyProductId String   // Stored as GID from resource picker
  productTitle     String
  productImage     String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  shop Shop @relation(fields: [shopId], references: [id])

  @@unique([shopId, shopifyProductId])
  @@index([shopId])
}
```

## Database Operations Patterns

### Find-or-Create Shop

```typescript
async function getOrCreateShop(shopDomain: string): Promise<Shop> {
  return prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain },
  });
}
```

### Batch Operations

```typescript
// Use transactions for multi-step operations
await prisma.$transaction([
  prisma.enabledProduct.deleteMany({ where: { shopId } }),
  prisma.enabledProduct.createMany({
    data: products.map((p) => ({
      shopId,
      shopifyProductId: p.id,
      productTitle: p.title,
      productImage: p.image,
    })),
  }),
]);
```

### Pagination for Admin UI

```typescript
const page = parseInt(url.searchParams.get("page") || "1");
const perPage = 20;

const [items, total] = await Promise.all([
  prisma.job.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * perPage,
    take: perPage,
  }),
  prisma.job.count({ where: { shopId } }),
]);
```

## GraphQL Pagination Utility

For paginating Shopify Admin API queries:

```typescript
// app/services/shopify-graphql.server.ts
import type { AdminApiContext } from "node_modules/@shopify/shopify-app-react-router/dist/ts/server/clients";

export async function paginateGraphQL(
  admin: AdminApiContext,
  options: {
    query: string;
    variables?: Record<string, unknown>;
    nodePath: string[];
    callback: (nodes: Record<string, unknown>[]) => Promise<void>;
    first?: number;
  },
): Promise<void> {
  let hasNextPage = true;
  let endCursor: string | null = null;
  const first = options.first || 50;

  while (hasNextPage) {
    const response = await admin.graphql(options.query, {
      variables: { ...options.variables, first, after: endCursor },
    });
    const json = await response.json();

    let data = json.data;
    for (const key of options.nodePath) {
      data = data?.[key];
    }

    const nodes = data?.nodes || data?.edges?.map((e: any) => e.node) || [];

    if (nodes.length > 0) {
      await options.callback(nodes);
    }

    hasNextPage = data?.pageInfo?.hasNextPage ?? false;
    endCursor = data?.pageInfo?.endCursor ?? null;
  }
}
```

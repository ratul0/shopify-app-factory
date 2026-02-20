# Auth Patterns

Shopify apps have three distinct authentication contexts. Using the wrong one causes cryptic errors.

## shopify.server.ts — The Auth Hub

Every Shopify app has exactly one `shopify.server.ts` file that configures authentication:

```typescript
// app/shopify.server.ts
import "@shopify/shopify-app-react-router/server/adapters/node";
import {
  AppDistribution,
  shopifyApp,
  ApiVersion,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April25, // Use latest stable
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore, // .SingleMerchant for custom apps
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}),
});

export default shopify;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
```

## Context 1: Admin Routes

Used for routes that render inside the Shopify admin iframe.

```typescript
// app/routes/app.tsx (layout)
import { authenticate } from "~/shopify.server";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}
```

**What `authenticate.admin` provides:**
- `admin` — GraphQL client for Shopify Admin API
- `session` — Current session with `shop` domain and access token
- `cors` — CORS headers helper (usually not needed for iframe routes)

**Usage in loader/action:**
```typescript
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Use admin.graphql() for Shopify Admin API calls
  const response = await admin.graphql(`
    query { shop { name plan { displayName } } }
  `);
  const data = await response.json();

  // Use session.shop for database lookups
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  return json({ shopName: data.data.shop.name, settings: shop });
};
```

## Context 2: App Proxy Routes

Used for routes that serve content at `https://<shop>.myshopify.com/apps/<subpath>/*`.

```typescript
// app/routes/proxy.check.tsx
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, liquid } = await authenticate.public.appProxy(request);

  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shop = session.shop; // e.g., "my-store.myshopify.com"

  // Your logic here
  return json({ enabled: true });
};
```

**What `authenticate.public.appProxy` provides:**
- `session` — Session with shop domain (may be null for unauthenticated requests)
- `liquid` — Helper to return Liquid-rendered responses
- No `admin` — proxy routes are PUBLIC. To make Admin API calls from a proxy route, use `unauthenticated.admin(shopDomain)`:

```typescript
const { session } = await authenticate.public.appProxy(request);
const { admin } = await unauthenticated.admin(session.shop);
// Now you can use admin.graphql()
```

**App proxy configuration in `shopify.app.toml`:**
```toml
[app_proxy]
url = "/proxy"
prefix = "apps"
subpath = "myapp"
# Results in: https://<shop>.myshopify.com/apps/myapp/*
```

**Route naming convention:**
- `proxy.check.tsx` → `GET /proxy/check` → `https://shop.myshopify.com/apps/myapp/check`
- `proxy.render.tsx` → `POST /proxy/render` → `https://shop.myshopify.com/apps/myapp/render`
- `proxy.status.tsx` → `GET /proxy/status?jobId=x` → `https://shop.myshopify.com/apps/myapp/status?jobId=x`

## Context 3: Webhook Routes

Used for routes that receive Shopify webhooks.

```typescript
// app/routes/webhooks.app.uninstalled.tsx
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhooks can fire after app is already uninstalled
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Clean up app-specific data
  // await prisma.shop.delete({ where: { shopDomain: shop } });

  return new Response();
};
```

**What `authenticate.webhook` provides:**
- `shop` — Shop domain
- `session` — Current session (may be null)
- `topic` — Webhook topic (e.g., `APP_UNINSTALLED`)
- `payload` — Webhook payload (parsed JSON)

**Webhook configuration in `shopify.app.toml`:**
```toml
[webhooks]
api_version = "2025-04"

[[webhooks.subscriptions]]
topics = ["app/uninstalled", "app/scopes_update"]

[[webhooks.subscriptions]]
topics = ["customers/data_request", "customers/redact", "shop/redact"]
compliance_topics = true
```

## Context 4: Unauthenticated Admin (for Workers)

Workers run as separate processes without access to the request context. Use `unauthenticated.admin`:

```typescript
// In worker process
const { unauthenticated } = await import("./shopify.server");

async function processJob(shopDomain: string) {
  const { admin } = await unauthenticated.admin(shopDomain);
  // Use admin.graphql() with the shop's offline access token
}
```

**Critical:** The worker MUST lazy-import `shopify.server.ts` because `shopifyApp()` validates `SHOPIFY_APP_URL` at module load time. In the worker, this env var may not be set until Shopify CLI injects it:

```typescript
// Bridge env var naming gap
if (!process.env.SHOPIFY_APP_URL) {
  process.env.SHOPIFY_APP_URL = process.env.APP_URL || process.env.HOST || "";
}

// NOW safe to import
const { unauthenticated } = await import("./shopify.server");
```

## Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Using `authenticate.admin` in proxy route | 401 error on storefront | Use `authenticate.public.appProxy` |
| Using `authenticate.public.appProxy` in admin route | No admin GraphQL access | Use `authenticate.admin` |
| Importing `shopify.server.ts` at top level in worker | Crash on missing `SHOPIFY_APP_URL` | Dynamic import after env setup |
| Forgetting GDPR webhooks | App Store rejection | Always register compliance webhooks |
| Not checking `session` nullability in proxy | Crash on unauthenticated requests | Guard with `if (!session)` |

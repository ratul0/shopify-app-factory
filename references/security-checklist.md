# Security Checklist

OWASP-aligned security verification for Shopify apps. Run through this before deploying to production.

## GDPR Compliance (Mandatory for App Store)

- [ ] **customers/data_request webhook** — Responds to customer data access requests
- [ ] **customers/redact webhook** — Deletes customer data on request
- [ ] **shop/redact webhook** — Deletes all shop data 48 hours after uninstall
- [ ] **app/uninstalled webhook** — Cleans up sessions and marks shop as inactive
- [ ] **Privacy policy URL** — Set in Partners Dashboard
- [ ] **No customer PII stored unnecessarily** — Only store what you need

## Authentication & Authorization

- [ ] **Admin routes use `authenticate.admin(request)`** — Never skip auth in admin routes
- [ ] **Proxy routes use `authenticate.public.appProxy(request)`** — Validates HMAC signature
- [ ] **Webhook routes use `authenticate.webhook(request)`** — Validates webhook HMAC
- [ ] **No auth context mixing** — Each route uses exactly one auth method
- [ ] **Session validation** — Check `session` is not null before using it
- [ ] **Offline access tokens** — Use `expiringOfflineAccessTokens: true` in future flags
- [ ] **Session storage in database** — NOT in-memory (doesn't survive restarts)

## Input Validation

- [ ] **File uploads validated** — Check MIME type, file size, file extension
- [ ] **Query parameters sanitized** — Validate and parse, don't trust raw input
- [ ] **Product IDs normalized** — Strip non-numeric characters before using
- [ ] **No SQL injection** — Use Prisma parameterized queries, never string concatenation
- [ ] **No XSS in Liquid** — Use `{{ value | escape }}` for user-supplied content
- [ ] **Request body size limits** — Set max file size in Busboy/multer config
- [ ] **Rate limiting on proxy endpoints** — Prevent abuse of public endpoints

### File Upload Validation Pattern

```typescript
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

busboy.on("file", (name, stream, info) => {
  if (!ALLOWED_MIME_TYPES.includes(info.mimeType)) {
    stream.resume(); // Drain the stream
    reject(new Error(`Invalid file type: ${info.mimeType}`));
    return;
  }

  const chunks: Buffer[] = [];
  let totalSize = 0;

  stream.on("data", (chunk) => {
    totalSize += chunk.length;
    if (totalSize > MAX_FILE_SIZE) {
      stream.destroy();
      reject(new Error("File too large"));
      return;
    }
    chunks.push(chunk);
  });
});
```

## Data Protection

- [ ] **Secrets in environment variables** — Never hardcode API keys, passwords, tokens
- [ ] **No secrets in client-side code** — Check that env vars aren't leaked to browser bundles
- [ ] **Database credentials rotated** — Use managed database with rotating credentials
- [ ] **S3 bucket not publicly writable** — Only the app can upload; public read is OK for CDN
- [ ] **Minimal Shopify scopes** — Request only the scopes you actually need
- [ ] **Access tokens stored encrypted** — Prisma session storage handles this

## Error Handling

- [ ] **No stack traces in production responses** — Return generic error messages
- [ ] **Structured error logging** — Log errors server-side with context, not to client
- [ ] **Graceful degradation** — App doesn't crash on external service failure
- [ ] **Worker error recovery** — Failed jobs retry with exponential backoff, then stop
- [ ] **Cleanup on failure** — Delete orphaned uploads when job processing fails

### Error Response Pattern

```typescript
// In proxy routes — don't leak internal details
try {
  // ... processing
} catch (error) {
  console.error("Processing failed:", error); // Log full error server-side
  return json(
    { error: "Processing failed. Please try again." }, // Generic client message
    { status: 500 },
  );
}
```

## Infrastructure

- [ ] **HTTPS only** — `force_https = true` in fly.toml
- [ ] **Health checks configured** — Both web and worker processes
- [ ] **Database backups** — Managed Postgres with point-in-time recovery
- [ ] **Redis persistence** — Use a managed Redis with persistence (Upstash, not ephemeral)
- [ ] **Container scanning** — Use minimal base images (Alpine), keep dependencies updated
- [ ] **No `node_modules` in image** — Use multi-stage Docker build

## Shopify-Specific

- [ ] **App proxy HMAC validation** — `authenticate.public.appProxy` handles this automatically
- [ ] **Webhook HMAC validation** — `authenticate.webhook` handles this automatically
- [ ] **CSP headers** — Shopify embeds handle this, but verify for app proxy pages
- [ ] **OAuth state parameter** — Shopify library handles this, don't implement custom OAuth
- [ ] **Nonce validation** — Used in OAuth flow, handled by Shopify library
- [ ] **API version pinned** — Use a specific `ApiVersion`, not "latest"

## Pre-Deploy Verification

Run through these final checks:

```bash
# 1. No secrets in codebase
grep -r "sk_live\|api_key.*=.*['\"]" app/ --include="*.ts" --include="*.tsx"

# 2. No console.log with sensitive data
grep -r "console.log.*token\|console.log.*password\|console.log.*secret" app/

# 3. Prisma schema has indexes for query patterns
npx prisma validate

# 4. Build succeeds
npm run build

# 5. TypeScript has no errors
npm run typecheck

# 6. All webhook routes exist
ls app/routes/webhooks.*.tsx
# Should see: app.uninstalled, app.scopes_update, customers.data_request,
#             customers.redact, shop.redact
```

## Post-Deploy Verification

```bash
# 1. Health check passes
curl https://your-app.fly.dev/healthz

# 2. Worker health check passes (if applicable)
# (internal to Fly network, check via fly logs)

# 3. Install app on development store and verify:
#    - OAuth flow completes
#    - Admin pages load
#    - Proxy endpoints respond
#    - Webhooks fire on uninstall/reinstall
```

---
name: shopify-app-factory
description: >
  Build production-ready Shopify apps from idea to deployment. Use this skill when the user wants to
  build a Shopify app, create a Shopify extension, scaffold a new Shopify project, add features to an
  existing Shopify app, or says "build me a Shopify app". Covers the full lifecycle: discovery,
  market research, architecture, scaffolding, implementation, deployment, and App Store submission. Encodes
  battle-tested patterns from production Shopify apps including two-context auth, atomic credit
  claiming, BullMQ background jobs, S3 storage, and Polaris Web Components.
---

# Shopify App Factory

You are a Shopify app development specialist. You guide the user from a raw idea to a deployed,
App Store-ready application using a structured 7-phase process with mandatory validation at every step.

## Stack

Default stack (escape hatches noted per phase):

- **Framework:** React Router v7 (file-system routing via `flatRoutes`)
- **ORM:** Prisma + PostgreSQL
- **Queue:** BullMQ + Redis (when background processing needed)
- **Storage:** S3-compatible (MinIO locally, Cloudflare R2 or AWS S3 in production)
- **Admin UI:** Polaris Web Components (`s-page`, `s-section`, `s-button` — NOT React Polaris)
- **Extensions:** Theme App Extension (Liquid + vanilla JS)
- **Deployment:** Fly.io (Docker multi-stage build)
- **AI:** Vercel AI SDK + provider adapters (when AI features needed)

## How You Work

### Phase Overview

| Phase | Handler | Execution | Gate |
|-------|---------|-----------|------|
| 1. Discovery | Inline (below) | Main context | User confirms App Specification |
| 2. Reddit Research | `agents/researcher.md` | **Sub-agent** | User confirms research findings |
| 3. Architecture | `agents/architect.md` | **Sub-agent** | User approves Architecture Document |
| 4. Scaffolding | Inline (below) | Main context | Project runs `npm run dev` successfully |
| 5. Implementation | `agents/implementor.md` | **Sub-agent(s)** | All code validated via MCP |
| 6. Deployment | Inline (below) | Main context | App accessible at production URL |
| 7. App Store Prep | `shopify-app-release-assistant` | Skill delegation | 14 deliverables complete |

**Rules:**
- Never skip a phase. Each phase produces a deliverable that feeds the next.
- Always get user confirmation before advancing to the next phase.
- Load reference files on-demand (instructions below), never all at once.

### Context Window Management

**Critical:** Do NOT run all phases in the main context. Each phase produces large intermediate
artifacts (search results JSON, MCP validation logs, code blocks) that fill the context window
and crowd out later phases. Use **sub-agents** (via the Task tool) for phases with dedicated
agent files.

**How it works:**

| Phase | Execution | Why |
|-------|-----------|-----|
| 1. Discovery | **Main context** | Interactive Q&A — needs direct user conversation |
| 2. Reddit Research | **Sub-agent** | Produces large JSON from Reddit searches; only the final Research Report returns to main |
| 3. Architecture | **Sub-agent** | MCP tool calls produce verbose output; only the final Architecture Document returns to main |
| 4. Scaffolding | **Main context** | Short phase — runs CLI commands, verifies `npm run dev` |
| 5. Implementation | **Sub-agent(s)** | Largest phase — delegate feature-by-feature; each feature gets its own sub-agent context |
| 6. Deployment | **Main context** | Short phase — runs deployment commands |
| 7. App Store Prep | **Skill delegation** | Delegates to `shopify-app-release-assistant` |

**Sub-agent pattern:**

When delegating to a sub-agent, pass:
1. The agent prompt file content (e.g., `agents/researcher.md`)
2. The relevant reference files (e.g., `references/reddit-research-guide.md`)
3. The deliverables from prior phases (e.g., App Specification)
4. Clear instructions on what deliverable to return

The sub-agent does its work autonomously, interacts with the user as needed,
and returns a concise deliverable. The main context stores ONLY the deliverable,
not the sub-agent's intermediate work.

**Example — launching Phase 2 as a sub-agent:**

```
Use the Task tool to launch a sub-agent with this prompt:

"You are the Reddit Market Researcher for a Shopify app.

[Paste contents of agents/researcher.md]
[Paste contents of references/reddit-research-guide.md]

## Your Task
Research the following app idea on Reddit and produce a Reddit Research Report.

## App Specification
[Paste App Specification from Phase 1]

## Instructions
- Use scripts/reddit-researcher.js for all Reddit searches
- Present search queries to the user before executing
- Present findings conversationally, then offer the decision gate
- Return: (1) the Reddit Research Report, and (2) the App Specification (updated if user refined it)"
```

**For Phase 5 (Implementation)**, launch a separate sub-agent for each major feature group
(e.g., "Prisma schema + migrations", "Admin routes", "Proxy routes", "Worker setup").
Pass the Architecture Document to each. This prevents a single massive context from handling
all implementation at once.

---

## Phase 1: Discovery

Ask these questions to produce an **App Specification**. Ask them conversationally, not as a wall of text. Group related questions naturally.

### Required Questions

1. **Value prop:** What does this app do in one sentence?
2. **Starting point:** New app from scratch, or augmenting an existing codebase?
3. **Users:** Who uses it — merchant in Shopify admin, customer on storefront, or both?
4. **Shopify resources:** Which Shopify resources does it interact with? (products, orders, customers, inventory, discounts, fulfillments, etc.)
5. **Background processing:** Does it need async work? (image processing, bulk operations, webhook-driven tasks, scheduled jobs)
6. **Storefront UI:** Does it need storefront-facing UI? (theme app extension, app proxy pages, or none)

### Conditional Follow-ups

Ask these based on answers above:

- **If storefront UI:** What extension types? (product page block, cart drawer, checkout, app proxy page)
- **If background processing:** What triggers async work? (user action, webhook, schedule)
- **If billing needed:** Billing model? (free, freemium with limits, paid plans, usage-based)
- **If both admin + storefront:** What data flows between admin config and storefront display?
- **If AI features:** What AI capabilities? (text generation, image generation, classification, embeddings)

### App Specification Output

After gathering answers, produce a structured specification:

```markdown
## App Specification

**Name:** [app name]
**Value Prop:** [one sentence]
**Users:** [admin | storefront | both]
**Shopify Resources:** [list with access type: read/write]
**Required Scopes:** [derived from resources]
**Extensions:** [list with types]
**Background Jobs:** [yes/no, with triggers]
**Billing:** [model]
**AI Features:** [yes/no, with details]
**Key Workflows:** [numbered list of user stories]
```

Ask the user to confirm before proceeding. After confirmation, automatically proceed to Phase 2.

---

## Phase 2: Reddit Research

**Delegate to a sub-agent.** Do not run this phase in the main context.

Launch a sub-agent (Task tool) with:
- Prompt: contents of `agents/researcher.md`
- Reference: contents of `references/reddit-research-guide.md`
- Input: App Specification from Phase 1
- Script path: `scripts/reddit-researcher.js` (for Reddit searches)

**Inputs:** App Specification from Phase 1.
**Outputs:** Reddit Research Report (market validation, competitive landscape, feature suggestions).

This phase triggers automatically after Phase 1 confirmation. The sub-agent researcher uses
`scripts/reddit-researcher.js` to search Shopify-related subreddits for pain points,
competitor mentions, and feature requests related to the app idea.

The sub-agent interacts with the user directly (query approval, decision gate). When it
completes, store only the returned **Reddit Research Report** and **App Specification**
(which may have been updated) in the main context. Discard intermediate search results.

**Transition:** Requires user confirmation. User may refine the App Specification
based on research findings before proceeding to Phase 3.

---

## Phase 3: Architecture

**Delegate to a sub-agent.** Do not run this phase in the main context.

Launch a sub-agent (Task tool) with:
- Prompt: contents of `agents/architect.md`
- Inputs: App Specification + Reddit Research Report
- Access to Shopify MCP tools

**Inputs:** App Specification from Phase 1, Reddit Research Report from Phase 2.
**Outputs:** Architecture Document (file structure, Prisma schema, route map, API scopes, extension plan, job topology, env vars).

The architect MUST use Shopify MCP tools to verify that required API resources and scopes exist.
When the sub-agent completes, store only the returned **Architecture Document** in the main context.
Discard MCP tool call logs and intermediate schema explorations.

---

## Phase 4: Scaffolding

Based on the Architecture Document:

### New App

```bash
shopify app init --template=remix --name=[app-name]
cd [app-name]
```

Then augment the scaffolded app:
1. Install additional dependencies from `references/stack-blueprint.md`
2. Set up `docker-compose.yml` for local infrastructure
3. Create `.env.example` with all required env vars
4. Configure `shopify.app.toml` (scopes, webhooks, app proxy)
5. Set up worker process in `worker/shopify.web.toml`

### Existing App

Audit the existing codebase against the Architecture Document:
1. Identify missing dependencies
2. Check for required infrastructure (Redis, S3)
3. Verify auth patterns match the two-context model
4. Plan incremental additions

**Gate:** The user can run `docker compose up -d && npm run dev` and see the app load in the Shopify admin.

---

## Phase 5: Implementation

**Delegate to sub-agent(s).** Do not run this phase entirely in the main context.

This is the largest phase. Launch **separate sub-agents per feature group** to prevent
context overflow. Each sub-agent receives:
- Prompt: contents of `agents/implementor.md`
- Relevant reference files for the feature being implemented
- The Architecture Document (for contracts and schemas)
- The specific feature group to implement

**Suggested feature groups** (each gets its own sub-agent):
1. Prisma schema + migrations + `shopify.server.ts`
2. Admin routes + Polaris UI
3. Proxy routes (if needed)
4. Services layer + GraphQL utilities
5. Worker + background jobs (if needed)
6. Extensions + Liquid (if needed)
7. Webhook handlers + Docker + deployment config

**Inputs:** Architecture Document, scaffolded project.
**Outputs:** Feature-complete application with all code validated via MCP.

Implementation follows a fixed order to manage dependencies correctly. Each sub-agent handles
MCP validation of its own code. After each sub-agent completes, verify the feature works
before launching the next.

---

## Phase 6: Deployment

Load `references/deployment-flyio.md` for patterns.

### Steps

1. **Dockerfile:** Multi-stage build (base → build → production)
2. **fly.toml:** Region, scaling, health checks
3. **Secrets:** Set via `fly secrets set`
4. **Database:** Provision Fly Postgres or connect external DB
5. **Redis:** Provision Upstash Redis or Fly Redis
6. **S3:** Configure Cloudflare R2 or AWS S3 bucket
7. **Deploy:** `fly deploy` + verify health checks pass
8. **Shopify Config:** Update app URL in Partner Dashboard

### Security Audit (Pre-deploy)

Load `references/security-checklist.md` and verify all items pass before deploying.

---

## Phase 7: App Store Prep

Delegate entirely to the `shopify-app-release-assistant` skill. It handles:
- App listing copy (name, tagline, description, screenshots)
- Privacy policy and terms of service
- GDPR webhooks verification
- App review checklist

Invoke with: "Prepare this Shopify app for App Store submission"

---

## MCP Tool Protocol

These rules are MANDATORY. Every piece of Shopify-specific code must be validated.

### 8 Rules

1. **Always call `learn_shopify_api` first** — before any other Shopify MCP tool. Store the `conversationId` and pass it to all subsequent calls.

2. **Call `learn_shopify_api` again when switching API contexts** — e.g., from `admin` to `functions` or `polaris-admin-extensions`. Pass the existing `conversationId`.

3. **Validate ALL GraphQL before presenting to user** — use `validate_graphql_codeblocks`. Fix any errors before showing. Never show unvalidated GraphQL.

4. **Validate ALL Polaris components before presenting** — use `validate_component_codeblocks` with the correct `api` param (`polaris-app-home` for admin pages).

5. **Validate ALL Liquid before presenting** — use `validate_theme` with the theme directory path.

6. **Use `introspect_graphql_schema` to explore APIs** — before writing GraphQL, search the schema to verify fields exist. Try multiple search terms if first returns nothing.

7. **Use `search_docs_chunks` for patterns** — when implementing Shopify-specific features (webhooks, billing, app proxy), search docs for current best practices.

8. **Use `fetch_full_docs` for complete guides** — when doc chunks reference a full page, fetch it for complete context.

### Tool Sequencing

```
learn_shopify_api(api) → conversationId
  ├── introspect_graphql_schema(conversationId, query) → verify fields
  ├── search_docs_chunks(conversationId, prompt) → find patterns
  ├── fetch_full_docs(conversationId, paths) → complete guides
  ├── validate_graphql_codeblocks(conversationId, codeblocks) → validate
  ├── validate_component_codeblocks(conversationId, code, api) → validate
  └── validate_theme(conversationId, path, files) → validate
```

---

## Reference Loading

Load reference files ONLY when entering the relevant phase or making a relevant decision. Do not load all at once.

| When | Load |
|------|------|
| Phase 2 (Reddit Research) | `references/reddit-research-guide.md` |
| Phase 4 (Scaffolding) | `references/stack-blueprint.md` |
| Phase 3 or 5 (Auth design/implementation) | `references/auth-patterns.md` |
| Phase 3 or 5 (Data model design/implementation) | `references/data-patterns.md` |
| Phase 5 (Implementing background jobs) | `references/background-jobs.md` |
| Phase 6 (Deployment) | `references/deployment-flyio.md` |
| Phase 6 (Security audit) | `references/security-checklist.md` |
| Phase 5 (Building extensions) | `references/extension-templates.md` |
| Any phase (Using MCP tools) | `references/mcp-validation-guide.md` |

---

## Cross-Skill Delegation

Delegate to these skills at the appropriate moments:

| Skill | When to Delegate |
|-------|-----------------|
| `frontend-design` | When building admin UI pages that need polished design |
| `vercel-react-best-practices` | During Phase 5 when writing React components |
| `react-doctor` | After Phase 5 to audit React code quality |
| `shopify-app-release-assistant` | Phase 7 entirely |

Delegation format: Mention the skill name so it triggers automatically.

---

## Mandatory Patterns

These patterns are non-negotiable. Every app built with this skill MUST include them:

### 1. Two Auth Contexts

Admin routes use `authenticate.admin(request)`. Proxy routes use `authenticate.public.appProxy(request)`. Never mix them. See `references/auth-patterns.md`.

### 2. Product ID Normalization

Every product lookup MUST query all three ID formats with an OR clause. See `references/data-patterns.md`.

### 3. GDPR Webhooks

Every app MUST handle `customers/data_request`, `customers/redact`, and `shop/redact` webhooks.

### 4. Atomic Operations

Never use check-then-increment for credits, limits, or counters. Use single SQL UPDATE with conditions. See `references/data-patterns.md`.

### 5. Polaris Web Components

Admin UI MUST use Polaris Web Components (`s-page`, `s-section`, `s-card`, `s-button`), NOT the React Polaris component library. See `references/mcp-validation-guide.md`.

### 6. Stateless Web Tier

The web process must be stateless. All state goes in PostgreSQL (durable), Redis (ephemeral), or S3 (files). This enables horizontal scaling.

### 7. Health Checks

Worker processes MUST expose a `/healthz` endpoint on a separate port for orchestrator health monitoring.

---

## Escape Hatches

The default stack works for 90% of apps. Flag these alternatives when detected during discovery:

| Signal | Alternative |
|--------|------------|
| "Headless storefront" or "custom storefront" | Hydrogen instead of theme extensions |
| "Extension only" (no admin UI needed) | Skip React Router, build extension-only app |
| "Serverless" or "no background jobs" | Skip BullMQ/Redis, use direct processing |
| "Multi-tenant SaaS" | Add tenant isolation patterns to data layer |
| "High volume webhooks" | Add webhook queue (BullMQ) instead of inline processing |

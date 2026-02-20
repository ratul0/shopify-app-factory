# Shopify App Factory

An AI agent skill that builds production-ready Shopify apps from idea to deployment. Works with [Claude Code](https://claude.ai/code), [Amp](https://amp.dev), and other AI coding agents that support the [skills](https://skills.sh) format.

## What It Does

Takes you through a structured 6-phase process:

1. **Discovery** — Asks clarifying questions to produce an App Specification
2. **Architecture** — Designs data model, routes, APIs, and extensions using Shopify MCP
3. **Scaffolding** — Sets up the project with `shopify app init` + infrastructure
4. **Implementation** — Generates validated code feature-by-feature
5. **Deployment** — Configures Fly.io, runs security audit, deploys
6. **App Store Prep** — Delegates to release assistant for 14 App Store deliverables

Every piece of Shopify-specific code (GraphQL, Polaris components, Liquid templates) is **validated via Shopify Dev MCP** before you see it.

## Install

```bash
npx skills add yafi/shopify-app-factory
```

Or with a specific agent:

```bash
# Claude Code
npx skills add yafi/shopify-app-factory --agent claude-code

# Amp
npx skills add yafi/shopify-app-factory --agent amp
```

## Usage

Once installed, the skill activates when you say things like:

- "Build me a Shopify app that..."
- "Create a Shopify extension for..."
- "Scaffold a new Shopify project"

The skill will guide you through discovery questions, then design and implement the app step by step.

## Default Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Router v7 (file-system routing) |
| ORM | Prisma + PostgreSQL |
| Queue | BullMQ + Redis |
| Storage | S3-compatible (MinIO locally, R2/S3 in production) |
| Admin UI | Polaris Web Components |
| Extensions | Theme App Extension (Liquid + vanilla JS) |
| Deployment | Fly.io (Docker multi-stage build) |

## What's Inside

```
SKILL.md                          # Phase coordinator
agents/
  architect.md                    # Architecture design sub-agent
  implementor.md                  # Code generation + MCP validation
references/
  stack-blueprint.md              # Dependencies, configs, Docker Compose
  auth-patterns.md                # Admin vs proxy vs webhook auth
  data-patterns.md                # Product ID normalization, atomic operations
  background-jobs.md              # BullMQ worker template
  deployment-flyio.md             # Dockerfile, fly.toml, secrets
  security-checklist.md           # OWASP + GDPR + Shopify-specific
  extension-templates.md          # Theme/checkout/admin/POS scaffolds
  mcp-validation-guide.md         # Step-by-step for Shopify MCP tools
```

## Battle-Tested Patterns

The reference files encode patterns extracted from a production Shopify app:

- **Three auth contexts** — Admin, App Proxy, and Webhook routes each use different authentication
- **Product ID normalization** — Every product lookup queries 3 ID formats (GID, numeric, original) to prevent silent failures
- **Atomic credit claiming** — Single SQL UPDATE prevents race conditions on usage limits
- **BullMQ job lifecycle** — Atomic job claiming, stall detection, graceful shutdown, health checks
- **Stateless web tier** — All state in PostgreSQL/Redis/S3 for horizontal scaling

## Requirements

- [Shopify Dev MCP](https://github.com/Shopify/dev-mcp) — for API verification and code validation
- A Shopify Partner account and development store

## Complementary Skills

Works well with:

- [`vercel-react-best-practices`](https://github.com/vercel-labs/skills) — React optimization during implementation
- [`frontend-design`](https://skills.sh) — Polished admin UI design
- [`shopify-app-release-assistant`](https://github.com/yafi/shopify-app-release-assistant) — App Store submission (auto-delegated in Phase 6)

## License

MIT

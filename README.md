# Shopify App Factory

An AI agent skill that builds production-ready Shopify apps from idea to deployment. Works with [Claude Code](https://claude.ai/code), [Amp](https://amp.dev), and other AI coding agents that support the [skills](https://skills.sh) format.

## What It Does

Takes you through a structured 7-phase process:

1. **Discovery** — Asks clarifying questions to produce an App Specification
2. **Reddit Research** — Validates your idea against real merchant conversations on Reddit
3. **Architecture** — Designs data model, routes, APIs, and extensions using Shopify MCP
4. **Scaffolding** — Sets up the project with `shopify app init` + infrastructure
5. **Implementation** — Generates validated code feature-by-feature
6. **Deployment** — Configures Fly.io, runs security audit, deploys
7. **App Store Prep** — Delegates to release assistant for 14 App Store deliverables

Every piece of Shopify-specific code (GraphQL, Polaris components, Liquid templates) is **validated via Shopify Dev MCP** before you see it.

## Install

```bash
npx skills add ratul0/shopify-app-factory
```

Or with a specific agent:

```bash
# Claude Code
npx skills add ratul0/shopify-app-factory --agent claude-code

# Amp
npx skills add ratul0/shopify-app-factory --agent amp
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
SKILL.md                          # Phase coordinator (7 phases)
agents/
  architect.md                    # Architecture design sub-agent
  implementor.md                  # Code generation + MCP validation
  researcher.md                   # Reddit market research sub-agent
scripts/
  reddit-researcher.js            # CLI for Reddit's public JSON API
references/
  reddit-research-guide.md        # Subreddit guide, query tips, report template
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

## How Reddit Research Works

After you describe your app idea (Phase 1), the skill automatically searches 8 Shopify-related subreddits for real merchant conversations about your problem space. It uses a built-in Node.js script (`scripts/reddit-researcher.js`) that hits Reddit's public JSON API — no API keys or accounts needed.

**What it looks for:**
- Merchants describing the exact pain point your app solves
- Existing apps in the space (competitors) and what merchants say about them
- Feature requests and wishlists
- Pricing complaints and expectations

**What you get:**
- A Reddit Research Report with evidence-backed findings
- Must-have / should-have / nice-to-have feature suggestions
- Competitive analysis with strengths, weaknesses, and pricing
- A chance to refine your App Specification before architecture begins

You stay in control — the skill presents its queries before searching, shows findings conversationally, and lets you choose whether to proceed as-is, refine your spec, or research more.

## Example: Building an App from Start to Finish

Here's what a real session looks like. You type one message to start — the skill handles the rest.

### You say:

> Build me a Shopify app that helps merchants write better product descriptions using AI

### Phase 1: Discovery

The skill asks you questions conversationally (not all at once):

```
Agent: What's the core value prop in one sentence?
You:   AI-powered product description generator that matches your brand voice.

Agent: Who uses it — merchant in admin, customer on storefront, or both?
You:   Merchant in admin only.

Agent: Which Shopify resources does it need?
You:   Products — read existing descriptions, write new ones.

Agent: Does it need background processing?
You:   Yes — bulk generation for stores with hundreds of products.

Agent: Billing model?
You:   Freemium — 10 free descriptions/month, then paid plans.
```

The skill produces an **App Specification** and asks you to confirm.

### Phase 2: Reddit Research (automatic)

Immediately after you confirm, the skill starts market research:

```
Agent: I've generated these search queries based on your spec. Want to add or change any?

  Pain point:     "struggling with product descriptions shopify"
  Solution:       "best shopify app for product descriptions"
  Competitor:     "shopify AI description generator"
  Frustration:    "shopify product description app doesn't work"
  Workflow:       "how do you write product descriptions shopify"

You: Add "product description SEO shopify" too.
```

The skill searches Reddit, then presents findings:

```
Agent: Here's what I found across 8 subreddits (47 posts, 12 comment threads):

  1. Strong demand signal — 15+ posts asking for AI description tools,
     most with 10+ upvotes
  2. Top competitors: [AppX] and [AppY] — merchants like AppX's output
     quality but complain about pricing ($49/mo for 100 descriptions)
  3. Key gap: No app handles brand voice well — merchants want to set
     a tone and have it applied consistently

  Suggestion: Your "brand voice" angle is a real differentiator.
  Consider making it the hero feature, not just a setting.

  Full report ready. How do you want to proceed?
  (1) Proceed with original spec
  (2) Refine spec based on findings
  (3) Research more

You: Let's refine — make brand voice the main feature and add
     a "tone analyzer" that learns from existing descriptions.
```

The skill updates your App Specification and confirms the revised version.

### Phase 3: Architecture

The architect agent designs your app's technical blueprint, now informed by the research:

```
Agent: Based on your spec and the competitive research, here's the architecture:

  - Brand Voice model in Prisma (stores tone settings per shop)
  - Tone Analyzer service (reads existing descriptions, extracts patterns)
  - Bulk generation via BullMQ (processes up to 500 products)
  - Pricing: Free tier at 10/mo undercuts AppX's $49 for 100

  The competitive differentiation: brand voice persistence + bulk
  generation at a lower price point addresses both top complaints.
```

You review and approve the Architecture Document.

### Phase 4: Scaffolding

```
Agent: Running shopify app init, installing dependencies, setting up
       Docker Compose for PostgreSQL + Redis...

       ✓ npm run dev works — app loads in Shopify admin.
```

### Phase 5: Implementation

The implementor builds features one by one, validating all code via Shopify MCP. For key business logic (like the tone analysis algorithm), it asks you to make the design decision:

```
Agent: I've set up the tone analyzer service. The scoring function
       determines how well a generated description matches the brand voice.
       There are two valid approaches — cosine similarity on embeddings
       (more accurate, needs an API call) vs keyword frequency matching
       (faster, works offline). Which fits your product better?

You:   Cosine similarity — accuracy matters more for this use case.
```

### Phase 6: Deployment

```
Agent: Configuring Fly.io deployment...
       ✓ Security checklist passed (GDPR webhooks, auth patterns, input validation)
       ✓ Deployed to https://your-app.fly.dev
       ✓ App URL updated in Shopify Partner Dashboard
```

### Phase 7: App Store Prep

The skill delegates to the release assistant, which prepares your listing copy, privacy policy, screenshots guide, and review checklist.

---

**That's it.** One prompt to start, guided decisions along the way, and the skill handles everything from market research to deployment.

## Requirements

- [Shopify Dev MCP](https://github.com/Shopify/dev-mcp) — for API verification and code validation
- A Shopify Partner account and development store
- Node.js 18+ (for the Reddit research script)

## Complementary Skills

Works well with:

- [`vercel-react-best-practices`](https://github.com/vercel-labs/skills) — React optimization during implementation
- [`frontend-design`](https://skills.sh) — Polished admin UI design
- [`shopify-app-release-assistant`](https://github.com/ratul0/shopify-app-release-assistant) — App Store submission (auto-delegated in Phase 7)

## License

MIT

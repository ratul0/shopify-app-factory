# Reddit Research Guide

Market validation methodology for Shopify app ideas using Reddit's public data.

## Target Subreddits

Search in priority order. Start with r/shopify (highest signal density) before broadening.

| Subreddit | Focus Area | Signal Type |
|-----------|-----------|-------------|
| r/shopify | Core Shopify merchants | Pain points, app reviews, feature requests |
| r/ShopifyeCommerce | Shopify-specific ecommerce | Store optimization, app recommendations |
| r/reviewmyshopify | Store reviews and feedback | UX problems, conversion issues |
| r/ecommerce | General ecommerce | Industry trends, cross-platform comparisons |
| r/Entrepreneur | Business owners | Workflow pain points, tool recommendations |
| r/smallbusiness | Small business operations | Budget constraints, must-have tools |
| r/dropship | Dropshipping niche | Supplier integrations, automation needs |
| r/marketing | Marketing strategies | SEO, email, social media pain points |

## Query Crafting Tips

Use merchant vocabulary, not developer vocabulary. Merchants say "my store is slow" not "optimize Largest Contentful Paint."

### DO

- Use problem language: "struggling with", "can't figure out", "wish I could"
- Include Shopify-specific terms: "Shopify app", "Shopify store", "Shopify admin"
- Search for competitor names directly: "Oberlo alternative", "Judge.me vs"
- Use merchant slang: "conversion rate", "abandoned cart", "product page"

### DON'T

- Use developer jargon: "API integration", "webhook", "GraphQL"
- Search for overly broad terms: "ecommerce" alone returns noise
- Use marketing speak: "synergize", "leverage", "optimize"

### Query Templates

| Category | Template | Example |
|----------|----------|---------|
| Pain point | `"struggling with {problem} shopify"` | `"struggling with inventory tracking shopify"` |
| Solution-seeking | `"best shopify app for {need}"` | `"best shopify app for bulk editing"` |
| Competitor | `"{competitor} alternative shopify"` | `"Oberlo alternative shopify"` |
| Frustration | `"shopify {feature} doesn't work"` | `"shopify search doesn't work"` |
| Workflow | `"how do you handle {task} shopify"` | `"how do you handle returns shopify"` |

## Signal Interpretation

### Scoring Criteria

| Signal Level | Criteria | Action |
|-------------|----------|--------|
| **High** | 10+ upvotes AND 5+ comments | Fetch full comment thread, extract specific pain points |
| **Medium** | 5-9 upvotes OR 3-4 comments | Read title + selftext, note if relevant |
| **Low** | < 5 upvotes, < 3 comments | Skim for unique angles only |
| **Noise** | Self-promotion, link-only, removed | Skip entirely |

### Recency Weighting

- Posts < 6 months old: Full weight
- Posts 6-12 months old: 75% weight (Shopify changes fast)
- Posts 1-2 years old: 50% weight (check if problem still exists)
- Posts > 2 years old: 25% weight (likely outdated, note only if repeated recently)

### Red Flags to Filter

- **Self-promotion:** Posts by app developers promoting their own tool
- **Affiliate links:** "Use my link for a discount" — biased recommendations
- **Rage posts:** Single negative experience, no constructive detail
- **Outdated references:** Mentions of deprecated Shopify APIs or removed features

## Common Pitfalls

- **Recency bias:** Don't over-weight the latest posts. A pain point mentioned consistently over 2 years matters more than a trending post from yesterday.
- **Vocal minority:** 3 angry posts ≠ market demand. Look for broad agreement across multiple threads and subreddits.
- **Survivorship bias:** You only see merchants who are still on Reddit. Many who churned aren't posting.
- **Self-promotion disguised as questions:** "Has anyone tried [obscure app]?" is sometimes the developer fishing for attention.
- **Outdated Shopify API references:** Shopify evolves rapidly. A pain point from 2022 may have a native Shopify solution now.
- **Absence ≠ no demand:** If Reddit has no discussion, it could mean an untapped niche OR limited demand. Note the uncertainty.

## Report Template

Use this structure for the Reddit Research Report output:

```markdown
# Reddit Research Report: [App Name]

## App Idea Summary
[1-2 sentence recap of the app concept from Phase 1]

## Research Scope
- **Subreddits searched:** [list]
- **Queries executed:** [count]
- **Posts analyzed:** [count]
- **Comment threads read:** [count]
- **Time range:** [range]

## Key Findings

### Pain Points Validated
[Numbered list of merchant pain points confirmed by Reddit discussions]
- **Pain point:** [description]
- **Evidence:** [post title + link, upvotes, key quote]
- **Frequency:** [how many posts mention this]

### Feature Demand
[Features merchants are actively requesting]
- **Feature:** [description]
- **Evidence:** [links]
- **Priority signal:** [high/medium/low based on frequency and recency]

### Competitive Landscape
[See Competitive Analysis Template below]

### Market Gaps
[Opportunities identified — things merchants want but no app provides well]

### Red Flags
[Concerns: market saturation, shifting platform features, low demand signals]

## Suggestions

### Must-Have Features
[Features validated by multiple high-signal posts — ship these in v1]

### Should-Have Features
[Strong demand but not critical for launch]

### Pivot Considerations
[If research reveals a different core problem than originally specified]

### Differentiation Strategy
[How to stand out from existing apps based on competitive analysis]

## Raw Data
[Links to highest-signal posts for manual review]
```

## Competitive Analysis Template

Use this table for each competitor identified during research:

| Field | Details |
|-------|---------|
| **App Name** | [name] |
| **What It Does** | [1-sentence description from merchant perspective] |
| **Strengths** | [what merchants praise] |
| **Weaknesses** | [what merchants complain about] |
| **Pricing** | [pricing model and merchant sentiment about it] |
| **Merchant Sentiment** | Positive / Mixed / Negative |
| **Key Quotes** | [1-2 representative merchant quotes with links] |

Look for competitive signals in these patterns:
- "I tried X but..." — switching intent, unmet needs
- "X doesn't..." — feature gaps
- "switched from X to Y" — competitive movement
- "X is too expensive for..." — pricing opportunity
- "X stopped working after..." — reliability concerns

## Script Reference

The `scripts/reddit-researcher.js` CLI communicates via JSON to stdout, progress to stderr.

### Commands

```bash
# Search a single subreddit
node scripts/reddit-researcher.js search \
  --subreddit shopify --query "inventory management app" \
  --sort relevance --time year --limit 25

# Fetch comment thread (use a permalink from search results)
node scripts/reddit-researcher.js comments \
  --url "https://reddit.com/r/shopify/comments/abc123/post_title/" \
  --limit 50

# Search all 8 target subreddits (sequential, rate-limited)
node scripts/reddit-researcher.js search-all \
  --query "product description generator" \
  --sort relevance --time year --limit 10

# Search for app recommendations in a category
node scripts/reddit-researcher.js apps \
  --category "inventory management" \
  --sort relevance --time year --limit 15
```

### Output Format

All commands return JSON:

```json
// Success
{ "ok": true, "data": { ... } }

// Failure
{ "ok": false, "error": "description of what went wrong" }
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--subreddit` | string | — | Target subreddit (search command) |
| `--query` | string | — | Search query text |
| `--url` | string | — | Full Reddit post URL (comments command) |
| `--category` | string | — | App category (apps command) |
| `--sort` | string | `relevance` | Sort: relevance, hot, top, new |
| `--time` | string | `year` | Time range: hour, day, week, month, year, all |
| `--limit` | number | varies | Max results per subreddit |
| `--output` | string | — | Save JSON output to file path |

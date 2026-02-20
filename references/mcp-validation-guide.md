# MCP Validation Guide

Step-by-step instructions for using each Shopify Dev MCP tool. Every piece of Shopify-specific code
must be validated before showing it to the user.

## Tool Overview

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `learn_shopify_api` | Initialize API context, get `conversationId` | FIRST — before any other tool |
| `introspect_graphql_schema` | Explore schema fields and operations | Before writing GraphQL |
| `search_docs_chunks` | Find documentation and patterns | When implementing Shopify features |
| `fetch_full_docs` | Read complete documentation pages | When chunks reference a full guide |
| `validate_graphql_codeblocks` | Validate GraphQL queries/mutations | After writing ANY GraphQL |
| `validate_component_codeblocks` | Validate Polaris/UI components | After writing ANY component code |
| `validate_theme` | Validate Liquid templates | After writing ANY Liquid |
| `learn_extension_target_types` | Get extension target type declarations | When building extensions |

## Step 1: Initialize API Context

**Always call first.** Store the `conversationId` for all subsequent calls.

```
learn_shopify_api(api: "admin")
→ Returns: { conversationId: "abc-123", ... }
```

**Switch APIs** by calling again with the existing `conversationId`:
```
learn_shopify_api(api: "polaris-admin-extensions", conversationId: "abc-123")
learn_shopify_api(api: "functions", conversationId: "abc-123")
```

**Valid API values:**
- `admin` — Admin GraphQL API
- `storefront-graphql` — Storefront API
- `partner` — Partner API
- `customer` — Customer Account API
- `payments-apps` — Payments Apps API
- `functions` — Shopify Functions
- `polaris-app-home` — App home page components
- `polaris-admin-extensions` — Admin extension components
- `polaris-checkout-extensions` — Checkout extension components
- `polaris-customer-account-extensions` — Customer account extension components
- `pos-ui` — POS extension components
- `hydrogen` — Hydrogen storefront
- `liquid` — Liquid templating
- `custom-data` — Metafields and Metaobjects

## Step 2: Explore Schema (Before Writing GraphQL)

Before writing any GraphQL, verify the fields and operations exist:

```
introspect_graphql_schema(
  conversationId: "abc-123",
  query: "product",
  filter: ["queries", "mutations"]
)
```

**Search tips:**
- Search for the resource: `"product"`, `"order"`, `"customer"`
- Search for the operation: `"create"`, `"update"`, `"delete"`
- For camelCase names, try individual words: `"captureSession"` → try `"capture"`
- For list operations, try: `"all"`, `"list"`, or the plural name

**If no results:** Try broader terms. The schema has the answer — keep searching.

## Step 3: Find Documentation

Search for Shopify-specific patterns and best practices:

```
search_docs_chunks(
  conversationId: "abc-123",
  prompt: "how to implement app proxy authentication"
)
```

When chunks reference a full page, fetch it:

```
fetch_full_docs(
  conversationId: "abc-123",
  paths: ["/docs/api/app-proxy", "/docs/api/webhooks"]
)
```

## Step 4: Validate GraphQL

**After writing ANY GraphQL query or mutation, validate it:**

```
validate_graphql_codeblocks(
  conversationId: "abc-123",
  api: "admin",
  codeblocks: [
    {
      content: "query { shop { name plan { displayName } } }"
    }
  ]
)
```

**For multiple codeblocks, validate them all in one call:**
```
validate_graphql_codeblocks(
  conversationId: "abc-123",
  api: "admin",
  codeblocks: [
    { content: "query GetShop { shop { name } }" },
    { content: "mutation fileCreate($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id } } }" }
  ]
)
```

**API values for GraphQL validation:**
- `admin` — Most common
- `storefront-graphql` — Storefront queries
- `functions_discount`, `functions_cart_checkout_validation`, etc. — Function input queries

**If validation fails:**
1. Read the error message
2. Use `introspect_graphql_schema` to find the correct field names
3. Fix the GraphQL
4. Re-validate with the same `artifactId` and incremented `revision`

## Step 5: Validate Components

**After writing ANY Polaris or UI extension component code, validate it:**

```
validate_component_codeblocks(
  conversationId: "abc-123",
  api: "polaris-app-home",
  code: [
    {
      content: "function App() {\n  return (\n    <s-page title=\"Home\">\n      <s-card>\n        <s-text>Hello</s-text>\n      </s-card>\n    </s-page>\n  );\n}"
    }
  ]
)
```

**API values for component validation:**
- `polaris-app-home` — Admin app pages (uses Polaris Web Components: `s-page`, `s-card`, etc.)
- `polaris-admin-extensions` — Admin extensions (requires `extensionTarget`)
- `polaris-checkout-extensions` — Checkout extensions (requires `extensionTarget`)
- `polaris-customer-account-extensions` — Customer account extensions
- `pos-ui` — POS extensions

**Important for extensions:** Include `extensionTarget`:
```
validate_component_codeblocks(
  conversationId: "abc-123",
  api: "polaris-checkout-extensions",
  extensionTarget: "purchase.checkout.block.render",
  code: [{ content: "..." }]
)
```

**Code structure rules:**
- Wrap JS/TS code inside a function
- Put all JavaScript code outside the return statement
- Put all Polaris web components in the return statement

## Step 6: Validate Liquid

**After writing ANY Liquid template, validate it:**

```
validate_theme(
  conversationId: "abc-123",
  absoluteThemePath: "/path/to/extensions/ext-name",
  filesCreatedOrUpdated: [
    { path: "blocks/block-name.liquid" }
  ]
)
```

**The path in `filesCreatedOrUpdated` is relative to `absoluteThemePath`.**

## Validation Retry Pattern

When validation fails, fix and retry with artifact tracking:

```
// First attempt
validate_graphql_codeblocks(codeblocks: [{ content: "..." }])
→ Returns: { artifactId: "art-1", revision: 1, valid: false, errors: [...] }

// Fix the errors, retry with same artifactId
validate_graphql_codeblocks(codeblocks: [{
  content: "...(fixed)...",
  artifactId: "art-1",
  revision: 2
}])
→ Returns: { artifactId: "art-1", revision: 2, valid: true }
```

## Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Field not found" | Hallucinated GraphQL field | Use `introspect_graphql_schema` to find correct name |
| "Unknown component" | Wrong component name | Check Polaris Web Components docs |
| "Invalid prop" | Wrong prop name or value | Check component type declarations |
| "Missing required field" | Incomplete GraphQL selection | Add required fields to selection set |
| "Invalid Liquid syntax" | Malformed Liquid template | Check Liquid tag/filter syntax |

## Workflow Summary

```
1. learn_shopify_api(api) → conversationId
2. introspect_graphql_schema → verify fields exist
3. Write code
4. validate_graphql_codeblocks → fix if needed
5. validate_component_codeblocks → fix if needed
6. validate_theme → fix if needed
7. Show validated code to user
```

**Never show unvalidated Shopify code to the user.** If validation fails after 3 attempts, show the validation error and ask for guidance.

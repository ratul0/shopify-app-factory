#!/usr/bin/env node

// Reddit Market Research CLI for Shopify App Factory
// Uses Reddit's public JSON API — no authentication required.
// Node 18+ (native fetch).

const USER_AGENT = "shopify-app-factory-research/1.0";
const RATE_LIMIT_MS = 2000;
const JITTER_MS = 500;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 600;
const BACKOFF_JITTER_MS = 400;
const REQUEST_TIMEOUT_MS = 15000;

const TARGET_SUBREDDITS = [
  "shopify",
  "ShopifyeCommerce",
  "reviewmyshopify",
  "ecommerce",
  "Entrepreneur",
  "smallbusiness",
  "dropship",
  "marketing",
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function log(msg) {
  process.stderr.write(`[reddit-researcher] ${msg}\n`);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rateLimitDelay() {
  const delay = RATE_LIMIT_MS + randInt(0, JITTER_MS);
  log(`Rate-limit pause ${delay}ms`);
  await sleep(delay);
}

function backoffDelay(attempt) {
  return BACKOFF_BASE_MS * Math.pow(2, attempt) + randInt(0, BACKOFF_JITTER_MS);
}

function buildRedditUrl(path, params = {}) {
  // Ensure path ends with .json before query params
  const jsonPath = path.endsWith(".json") ? path : `${path}.json`;
  const url = new URL(`https://www.reddit.com${jsonPath}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function looksLikeHtml(text) {
  return text.trimStart().startsWith("<") || text.includes("<!DOCTYPE");
}

async function fetchJson(url) {
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = backoffDelay(attempt);
      log(`Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
      await sleep(delay);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        log(`Retryable HTTP ${res.status} from ${url}`);
        continue;
      }

      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status} from ${url}` };
      }

      const text = await res.text();

      if (looksLikeHtml(text)) {
        lastError = new Error("Reddit returned HTML instead of JSON");
        log("Got HTML response, retrying...");
        continue;
      }

      const data = JSON.parse(text);
      return { ok: true, data };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        lastError = new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`);
        log(`Timeout fetching ${url}`);
      } else {
        lastError = err;
        log(`Error: ${err.message}`);
      }
    }
  }

  return { ok: false, error: `Failed after ${MAX_RETRIES} retries: ${lastError?.message}` };
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

function extractPost(child) {
  const d = child.data;
  return {
    id: d.id,
    title: d.title,
    selftext: (d.selftext || "").slice(0, 500),
    score: d.score,
    num_comments: d.num_comments,
    permalink: `https://reddit.com${d.permalink}`,
    created_utc: d.created_utc,
    subreddit: d.subreddit,
    url: d.url,
  };
}

function flattenComments(children, depth = 0, maxDepth = 2) {
  const results = [];
  for (const child of children) {
    if (child.kind !== "t1") continue;
    const d = child.data;
    results.push({
      id: d.id,
      author: d.author,
      body: (d.body || "").slice(0, 1000),
      score: d.score,
      created_utc: d.created_utc,
      depth,
    });
    if (depth < maxDepth - 1 && d.replies && d.replies.data && d.replies.data.children) {
      results.push(...flattenComments(d.replies.data.children, depth + 1, maxDepth));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdSearch({ subreddit, query, sort, time, limit }) {
  if (!subreddit || !query) {
    return { ok: false, error: "Missing required args: --subreddit and --query" };
  }

  const url = buildRedditUrl(`/r/${subreddit}/search`, {
    q: query,
    restrict_sr: 1,
    sort: sort || "relevance",
    t: time || "year",
    limit: limit || 25,
  });

  log(`Searching r/${subreddit} for "${query}"`);
  const result = await fetchJson(url);

  if (!result.ok) return result;

  const posts = (result.data?.data?.children || []).map(extractPost);
  return { ok: true, data: { subreddit, query, count: posts.length, posts } };
}

async function cmdComments({ url: postUrl, limit }) {
  if (!postUrl) {
    return { ok: false, error: "Missing required arg: --url" };
  }

  // Normalize Reddit URL to JSON endpoint
  let cleanUrl = postUrl.split("?")[0].replace(/\/$/, "");
  cleanUrl = cleanUrl.replace("https://www.reddit.com", "").replace("https://reddit.com", "");

  const url = buildRedditUrl(cleanUrl, { limit: limit || 50 });

  log(`Fetching comments from ${cleanUrl}`);
  const result = await fetchJson(url);

  if (!result.ok) return result;

  // Reddit returns [post, comments] array
  const postData = result.data?.[0]?.data?.children?.[0];
  const commentsData = result.data?.[1]?.data?.children || [];

  const post = postData ? extractPost(postData) : null;
  const comments = flattenComments(commentsData);

  return { ok: true, data: { post, count: comments.length, comments } };
}

async function cmdSearchAll({ query, sort, time, limit }) {
  if (!query) {
    return { ok: false, error: "Missing required arg: --query" };
  }

  const allResults = [];
  const errors = [];

  for (const subreddit of TARGET_SUBREDDITS) {
    if (allResults.length > 0 || errors.length > 0) {
      await rateLimitDelay();
    }

    const result = await cmdSearch({
      subreddit,
      query,
      sort: sort || "relevance",
      time: time || "year",
      limit: limit || 10,
    });

    if (result.ok) {
      allResults.push(...result.data.posts);
    } else {
      errors.push({ subreddit, error: result.error });
      log(`Failed on r/${subreddit}: ${result.error}`);
    }
  }

  return {
    ok: true,
    data: {
      query,
      subreddits_searched: TARGET_SUBREDDITS.length,
      subreddits_failed: errors.length,
      total_posts: allResults.length,
      posts: allResults,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

async function cmdApps({ category, sort, time, limit }) {
  if (!category) {
    return { ok: false, error: "Missing required arg: --category" };
  }

  const queries = [
    `best shopify app ${category}`,
    `shopify ${category} app recommendation`,
    `shopify ${category} app review`,
  ];

  const targetSubs = ["shopify", "ecommerce"];
  const seen = new Set();
  const allPosts = [];
  const errors = [];
  let isFirst = true;

  for (const q of queries) {
    for (const subreddit of targetSubs) {
      if (!isFirst) {
        await rateLimitDelay();
      }
      isFirst = false;

      const result = await cmdSearch({
        subreddit,
        query: q,
        sort: sort || "relevance",
        time: time || "year",
        limit: limit || 15,
      });

      if (result.ok) {
        for (const post of result.data.posts) {
          if (!seen.has(post.id)) {
            seen.add(post.id);
            allPosts.push(post);
          }
        }
      } else {
        errors.push({ subreddit, query: q, error: result.error });
      }
    }
  }

  return {
    ok: true,
    data: {
      category,
      queries_run: queries.length * targetSubs.length,
      unique_posts: allPosts.length,
      posts: allPosts,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
      flags[key] = value;
      if (value !== true) i++;
    }
  }

  // Parse numeric flags
  if (flags.limit) flags.limit = parseInt(flags.limit, 10);

  return { command, flags };
}

function printUsage() {
  const usage = `Reddit Market Research CLI

Usage:
  node reddit-researcher.js <command> [options]

Commands:
  search      Search a single subreddit
  comments    Fetch comment thread from a post URL
  search-all  Search all target subreddits
  apps        Search for app recommendations in a category

Options:
  --subreddit <name>   Subreddit name (search command)
  --query <text>       Search query (search, search-all commands)
  --url <url>          Reddit post URL (comments command)
  --category <text>    App category (apps command)
  --sort <type>        Sort order: relevance, hot, top, new (default: relevance)
  --time <range>       Time range: hour, day, week, month, year, all (default: year)
  --limit <n>          Max results per subreddit (default varies by command)
  --output <path>      Save JSON output to file

Target subreddits (search-all):
  ${TARGET_SUBREDDITS.join(", ")}`;

  console.error(usage);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { command, flags } = parseArgs(process.argv);

  if (!command || command === "help" || command === "--help") {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  const commands = {
    search: cmdSearch,
    comments: cmdComments,
    "search-all": cmdSearchAll,
    apps: cmdApps,
  };

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  const result = await handler(flags);

  const output = JSON.stringify(result, null, 2);

  if (flags.output) {
    const fs = await import("node:fs");
    fs.writeFileSync(flags.output, output, "utf-8");
    log(`Output saved to ${flags.output}`);
  }

  console.log(output);
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});

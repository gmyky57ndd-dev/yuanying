# ES-036 — Web Search Tool & Markdown Reader

> **Scope note**: the follow-up tooling upgrades (ZIP per-file reads,
truncation metadata, CSV filters, `get_issue`) are in
> `ES-036-agentic-tooling-upgrades.md`.

**Status**: Approved
**Category**: Feature (Tool Integration)
**Tracking**: P2-19

> **Tracking note**: the handoff requested **P2-11**, but P2-11 is the completed
> ES-027 summary-tone item. This work is recorded as **P2-19** in
> `TRACKING.md`.

## 1. Goal

Give 元婴 read-only access to current external knowledge and to repository
Markdown documents.

- `web_search(query)` — up-to-date technical documentation, API usage, news,
  and factual information. Returns parsed title/url/snippet text, not raw HTML.
- `read_markdown(path)` — read a Markdown file from the repository (specs,
  help, runbooks, core).

## 2. `web_search` tool

```json
{
  "name": "web_search",
  "description": "Search the web for current information, API documentation, technical solutions, or recent news. Use when up-to-date external knowledge is needed. Returns the top 3 results as title/url/snippet text, not raw HTML.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "The search query" }
    },
    "required": ["query"]
  }
}
```

Provider order:

1. **Tavily** when `TAVILY_API_KEY` is set (LLM-friendly results, 1,000
   searches/month free).
2. **DuckDuckGo HTML** fallback when Tavily is absent or fails. No API key,
   rate-limited.
3. **Jina Reader → DuckDuckGo** fallback when the direct DuckDuckGo request is
   blocked (for example, a serverless IP gets HTTP 403). No API key.

Behavior:

- Returns the top **3** results as `{ title, url, snippet }`.
- Snippets are truncated to 1,200 chars.
- Provider failures fall through to the next option; if all fail, return an
explicit error.
- If no results or the provider fails, return an explicit error; never
  fabricate an answer or source.
- The tool is read-only and is not used for private data (notes, signals,
  Drive).

## 3. `read_markdown` tool

```json
{
  "name": "read_markdown",
  "description": "Read a Markdown file from the repository by relative path.",
  "parameters": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    },
    "required": ["path"]
  }
}
```

Rules:

- Allowed roots: `docs/specs`, `docs/help`, `docs/runbooks`, `core`.
- Allowed files: `AGENTS.md`, `TRACKING.md`, `README.md`.
- Only `.md` files.
- Reject absolute paths, `..`, NUL bytes, and paths outside the allowlist.
- Return at most 20,000 chars with `truncated` and `total_chars`.
- This covers the “make sure 元婴 can read md files” requirement. Drive
  Markdown remains covered by `get_drive_doc` (ES-030/ES-035).

## 4. Prompt / manifest

`core/system-manifest.md` now:

- Lists both tools under **你的工具**.
- Adds **Web search & Markdown** rules: use `web_search` for current external
  knowledge, cite URLs, never use it for private data; use `read_markdown` for
  repo specs/runbooks/help docs.
- The chat route also injects a per-request system reminder with the current
  tool list, so an old conversation that says “I have no web search” cannot
  override the real tool availability.

## 5. Files

- `lib/web-search.ts` — Tavily, DuckDuckGo HTML, and Jina Reader fallback parsing.
- `lib/read-markdown.ts` — allowlisted Markdown reader.
- `app/api/chat/route.ts` — tool definitions + execution.
- `core/system-manifest.md` — tool list and usage rules.
- `.env.example` — optional `TAVILY_API_KEY`.

## 6. Acceptance

- [x] User asks “How to use the Vercel AI SDK with tools?”
- [x] 元婴 triggers `web_search`.
- [x] 元婴 returns a valid answer based on the search snippets and cites URLs.
- [x] `read_markdown` can read an allowlisted Markdown file.
- [x] Path traversal and non-allowlisted paths are rejected.
- [x] `tsc`, lint, and build pass.
- [x] Production: `web_search` triggered and the answer cited search URLs.

## 7. Limits and fallback

- Web search is user-initiated; no background crawling.
- Tavily failure falls back to DuckDuckGo. If direct DuckDuckGo is blocked,
  the Jina Reader/DDG fallback is used. If all fail, return an explicit error.
- No raw HTML is passed to the model.
- No autonomous external actions: search is read-only.

## 8. Issue #33 — all backends failed

DuckDuckGo can return HTTP 403 from serverless IPs and Tavily may be
unconfigured. The search now reports every backend failure instead of
returning an empty result:

```text
All web search backends failed: tavily: not configured;
duckduckgo: DuckDuckGo search failed (HTTP 403);
jina/duckduckgo: Jina/DDG search failed (HTTP 403)
```

- Tavily → DuckDuckGo → Jina Reader/DDG.
- The Jina fallback fixes the serverless 403 path in production.
- If all fail, the model must say search is unavailable and must not guess.

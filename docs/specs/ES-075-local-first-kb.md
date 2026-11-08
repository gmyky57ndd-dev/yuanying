# ES-075 — Local-First AI Knowledge Base

- **Status:** Approved (2026-11-08), implementing. **Tracking:** P2-56.
- **Principle:** local-first, data sovereignty, no vendor lock-in.
- **Numbering:** the evening-summary pipeline (previously ES-075) is now **ES-079**.

## 1. Rule

**Raw conversations never land in a database.** Imported DeepSeek/ChatGPT/Claude
conversations are Markdown files on the owner's machine. Supabase, if involved at
all, may store only a *file path* and a short summary — never the body.

## 2. Layout

```
~/yuanying/local_kb/
  raw/deepseek/YYYY-MM-DD_HHmm_<hash>.md
  raw/chatgpt/...
  raw/claude/...
  index/sqlite.db          # FTS5 index (rebuildable from raw/)
  docs/ papers/            # existing hand-written KB (ES-078)
```

Frontmatter:

```yaml
---
id: <hash>
source: deepseek|chatgpt|claude|manual
model: deepseek-chat
title: ...
tags: [tailscale, networking]
summary: one or two sentences (this is the only field that may be mirrored verbatim)
created_at: 2026-11-08T12:00:00Z
---
```

## 3. Ingestion

- `POST /api/kb/ingest` (Next route, bearer auth) forwards to the local service
  `POST http://127.0.0.1:8080/ingest`. The service writes the Markdown file with a
  unique name, then inserts it into `index/sqlite.db` (FTS5).
- The assistant uses the `save_local_kb` tool for "把这段对话存进本地知识库".
- If the local service is down the route returns **503 with an explicit error** —
  never silently writes to the cloud.
- Supabase is not touched by this path.

## 4. Retrieval

- `GET /api/kb/search?q=...` → local service `POST /search` → FTS5 (bm25), with a
  keyword-scan fallback for the hand-written docs.
- `search_local_kb` (ES-078) already targets the same endpoint, so the architect
  fenshen retrieves both imported conversations and docs.
- The phone PWA uses the same route; it only reaches the Mac through the
  (temporary) bridge. No body ever leaves the machine.

## 5. MVP decisions / deviations

1. **No ChromaDB/LanceDB** in the MVP (owner's "no heavy dependencies" rule):
   SQLite FTS5 via Python's stdlib is enough; semantic search is a later step.
2. The index is **rebuildable**: `scripts/local_rag_server.py --reindex` scans
   `raw/**/*.md` and repopulates FTS5.
3. The Next.js cloud deployment cannot write local files by design; the ingest
   route is only functional where the app runs on the owner's machine (local
   bridge / future Coolify VPS with the same service). It fails loudly elsewhere.

## 6. Acceptance

- [ ] An imported conversation is a Markdown file under `raw/<source>/` with
      frontmatter.
- [ ] Supabase holds no long imported text (only optional path/summary).
- [ ] Search works from the local index while the app is offline from Supabase
      (the service has no Supabase dependency).
- [ ] The same query reaches the result through `/api/kb/search` and the
      `search_local_kb` tool.

## 7. Evidence (2026-11-08)

| Check | Result |
| --- | --- |
| Ingest via `/api/kb/ingest` | `raw/deepseek/2026-11-08_1937_e6cc3885.md`, YAML frontmatter (id/source/model/title/tags/summary/created_at) |
| Supabase body leak | 0 rows in `messages`/`signals` containing the imported body |
| Search via `/api/kb/search?q=Tailscale` | returns the imported file (path + summary + snippet) |
| Local service without Next/Supabase | `GET :8080/health` → `{"ok":true,"docs":3,"raw":2}`; `POST /search` returns Coolify |
| Chat tool `save_local_kb` | wrote `raw/manual/2026-11-08_1937_c4b44d98.md`, reply "存好了" |
| Index | SQLite FTS5 `kb` table: `docs/test.md`, `raw/deepseek/...`, `raw/manual/...` |

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

## 5. Implementation (Plan A, schema shaped for Plan B)

- **Embeddings:** Ollama + **bge-m3** (1024-d, multilingual), served at
  `127.0.0.1:11434`; `EMBED_MODEL` overridable by env.
- **Chunking:** 800 chars, 100 overlap; stable chunk ids
  `sha256(path:index)[:16]`.
- **Schema (B-ready):** `kb_docs`, `kb_chunks(id, doc_path, chunk_index, text,
  model, dim, embedding, updated_at)` + FTS5 tables (`kb_fts`, `kb_chunks_fts`).
  The chunk rows map 1:1 to a Chroma/Qdrant collection, so the index layer can
  be swapped without touching files or the API.
- **Hybrid retrieval:** FTS5 (BM25, chunk level) + cosine over bge-m3 vectors,
  merged with Reciprocal Rank Fusion (`k=60`); results carry
  `semantic: true|false` and `match: keyword|semantic|hybrid`.
- **Degradation:** Ollama down → keyword-only, `semantic:false` (never pretend).
- **Deviation:** vectors live in SQLite instead of Chroma for the MVP (no extra
  Python dependencies, single file, easy backup); the Chroma adapter is a later
  drop-in. This keeps the "no heavy deps" rule while preserving the B schema.

## 6. Collector (Phase 2, 2026-11-08)

`scripts/kb_collect.py` imports exports into the same raw/ + index pipeline:

- **DeepSeek first**: JSON list / `{conversations|data|chats|sessions:[...]}` /
  JSONL; each conversation may use `messages[]`, `chat_messages[]`,
  `conversation[]`, or a ChatGPT-style `mapping` tree.
- `.md`/`.txt` files are ingested as a single manual document.
- Title from `title|name|subject`, else the first user line; summary = first
  assistant line (≤160 chars).
- **Dedupe** by SHA-256 of the normalised body per source: a re-import reports
  `duplicate` and writes nothing.
- `--dry-run`, `--limit`, directory recursion, `--source auto` by filename.
- All writes go through the local service `/ingest`, so indexing/embeddings are
  identical to manual capture.

## 7. Networking (owner decision)

- The KB never moves to the VPS. The future Coolify Next.js will call the Mac
  over **Tailscale**.
- `HOST=0.0.0.0` (alias `KB_HOST`) makes the Python service listen on the
  tailnet interface; default remains `127.0.0.1`.
- `KB_TOKEN` optionally requires `Authorization: Bearer …` on every request —
  recommended whenever binding to `0.0.0.0`.
- Next.js reads `LOCAL_RAG_URL` (default `http://localhost:8080`) for
  `/api/kb/*`, the `search_local_kb` tool and the ingest tool.

## 8. Operational

- `scripts/local_rag_server.py --reindex` rebuilds docs+chunks (+ embeddings).
- `--embed` fills chunks that lack vectors.
- `--reindex --no-embed` is the offline rebuild.
- The Next.js cloud deployment cannot write local files by design; ingest fails
  loudly (503) there.

## 9. Acceptance

- [ ] An imported conversation is a Markdown file under `raw/<source>/` with
      frontmatter.
- [ ] Supabase holds no long imported text (only optional path/summary).
- [ ] Search works from the local index while the app is offline from Supabase
      (the service has no Supabase dependency).
- [ ] The same query reaches the result through `/api/kb/search` and the
      `search_local_kb` tool.

## 10. Evidence (2026-11-08)

| Check | Result |
| --- | --- |
| Ingest via `/api/kb/ingest` | `raw/deepseek/2026-11-08_1937_e6cc3885.md`, YAML frontmatter (id/source/model/title/tags/summary/created_at) |
| Supabase body leak | 0 rows in `messages`/`signals` containing the imported body |
| Search via `/api/kb/search?q=Tailscale` | returns the imported file (path + summary + snippet) |
| Local service without Next/Supabase | `GET :8080/health` → `{"ok":true,"docs":3,"raw":2}`; `POST /search` returns Coolify |
| Chat tool `save_local_kb` | wrote `raw/manual/2026-11-08_1937_c4b44d98.md`, reply "存好了" |
| Index | SQLite FTS5 `kb` table: `docs/test.md`, `raw/deepseek/...`, `raw/manual/...` |
| Semantic paraphrase | "内网穿透 组网工具" → `semantic:true, match:semantic`, 3 docs (Tailscale first) |
| Hybrid keyword | "Tailscale" → `semantic:true, match:hybrid` |
| Ollama down | `semantic:false, match:keyword`, results still returned |
| Model | `bge-m3:latest` 1.2 GB, 1024-d, local `/api/embed` |
| Collector (DeepSeek) | 2 conversations → `raw/deepseek/2026-11-08_2032_*.md`, both `embedded` |
| Collector dedupe | re-import → `duplicate: 2`, no new files (3 total) |
| HOST=0.0.0.0 | `lsof` → `TCP *:8080 (LISTEN)`; restored to `127.0.0.1` |

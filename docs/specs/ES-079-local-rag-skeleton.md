# ES-079 — Local RAG Engineering Skeleton & Collectors

- **Status:** Done (2026-11-08). **Tracking:** P2-57. Refs: ES-075, ES-078.
- **Context:** the architect review asked for the engineering skeleton (scripts,
  schema, index), FTS5/embedding/dedupe verification, ChatGPT parsing and an API
  proxy bypass.

## 1. Delivered

| Item | Where |
| --- | --- |
| Service + search/ingest | `scripts/local_rag_server.py` |
| Single-doc ingest | `scripts/ingest.py` |
| Export importer (DeepSeek/ChatGPT/Claude) | `scripts/kb_collect.py` |
| API proxy capture | `scripts/kb_proxy.py` |
| Parser tests | `scripts/test_kb_collect.py` (4 tests, pass) |
| SQLite DDL | `schema/kb.sql` |
| Index docs | `index/README.md` |

## 2. Verification

- **FTS5 exists**: `kb_fts` and `kb_chunks_fts` are real FTS5 virtual tables
  (shadow tables `*_data/_idx/_content/_docsize/_config` present).
- **Embedding model**: `select model,dim,count(*)` → `bge-m3|1024|5`.
- **Dedupe**: re-import → `duplicate: 2`, no new files. Fingerprint is SHA-256 of
  the normalised body (stronger than MD5; documented deviation).
- **ChatGPT parsing**: mapping-tree test passes (parent/child walk, role filter).
- **Proxy**: mock upstream → captured `raw/manual/2026-11-08_2232_bae2e6ae.md`
  with frontmatter, embedded by the temp KB service.

## 3. Deviations

1. **The SQLite `.db` is not committed.** It contains private conversations and
   this repository is public; `schema/kb.sql` + `--reindex` reproduce it. A demo
   index can be built from public docs only (`index/README.md`).
2. **SHA-256 instead of MD5** for the dedupe fingerprint.
3. **Proxy is a local sidecar**, not a cloud function: it forwards to
   `UPSTREAM` and writes only through the local KB service.

## 3a. Architect tool set (addendum 2026-11-08)

`fenshen.ai_architect.tools_whitelist` (migration 030):

```json
["web_search","search_local_kb","read_local_file","write_local_file",
 "read_code_file","get_issue_status","trigger_reindex"]
```

New tools:

| Tool | Behaviour |
| --- | --- |
| `read_code_file` | reads repo files under app/lib/components/scripts/supabase/collector/docs/core/public + root config files; blocks `..`, `.env*`, keys, `node_modules`, `.next`, `.git`, >512 KB, returns 20k chars |
| `get_issue_status` | compact GitHub issue status (state/labels/title/url/comment count/last comment) |
| `trigger_reindex` | `POST /reindex` on the local KB service (docs + chunks + embeddings), explicit failure when the service is down |

The local service also exposes `/reindex` and `/embed`.

## 4. Acceptance evidence

- `sqlite3 ~/yuanying/local_kb/index/sqlite.db ".tables"` →
  `kb_chunks kb_chunks_fts kb_docs kb_fts` (+ shadow tables).
- `head -7` of a raw Markdown file shows YAML frontmatter (Obsidian-renderable:
  `id/source/model/title/tags/summary/created_at`).
- `python3 scripts/test_kb_collect.py` → 4 tests OK.
- Proxy e2e: captured file + temp `/health` `{docs:1, embedded:1}`.
- Architect tools (dev :3001): reindex → `5 files / 5 chunks / embedded`; `read_code_file` correctly reported that `lib/api.ts` has no `getActiveModelInfo`; `get_issue_status` → "#88 还开着, 1 条评论".
- `[fenshen] ai_architect active_tools=web_search,read_code_file,get_issue_status,trigger_reindex,search_local_kb,read_local_file,write_local_file`.

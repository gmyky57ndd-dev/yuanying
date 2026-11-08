# Local KB index

The live database is **not** committed here: it contains private conversations
and this repository is public (data-sovereignty red line). It lives at:

```
~/yuanying/local_kb/index/sqlite.db
```

Everything needed to rebuild it is in the repo:

- `schema/kb.sql` — the exact SQLite DDL (docs, chunks, two FTS5 tables, indexes).
- `scripts/local_rag_server.py --reindex` — rebuilds docs + chunks + embeddings
  from `~/yuanying/local_kb/raw/**/*.md` and `docs/`.
- `scripts/ingest.py` — single-document ingest.
- `scripts/kb_collect.py` — DeepSeek/ChatGPT export import.

Verify the tables:

```bash
sqlite3 ~/yuanying/local_kb/index/sqlite.db ".tables"
# kb_chunks  kb_chunks_fts  kb_docs  kb_fts
```

A demo index containing only the public `docs/test.md` can be built with:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/docs" && cp docs/test.md "$tmp/docs/"
KB_DIR="$tmp" python3 scripts/local_rag_server.py --reindex
sqlite3 "$tmp/index/sqlite.db" ".tables"
```

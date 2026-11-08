# Local KB scripts (ES-075 / ES-079)

| Script | Purpose |
| --- | --- |
| `local_rag_server.py` | Local KB service (127.0.0.1:8080): `/health`, `/search`, `/ingest`; FTS5 + vectors. |
| `ingest.py` | One-document CLI ingest (file / text / stdin). |
| `kb_collect.py` | Export importer: DeepSeek, ChatGPT, Claude, manual; dedupe; dry-run. |
| `kb_proxy.py` | API proxy sidecar: forwards chat completions and captures them into the KB. |
| `test_kb_collect.py` | Parser tests (DeepSeek list, ChatGPT mapping tree, heuristics). |

## Embedding model

**`bge-m3`** via Ollama (1024-d, multilingual). Not `nomic-embed-text`.
Override with `KB_EMBED_MODEL` if needed; the DB records the model per chunk.

## Dedupe fingerprint

SHA-256 of the normalised body (per source), stored in `kb_docs.sha256`; the
importer reports `duplicate` and writes nothing. (SHA-256 is used instead of MD5
— same purpose, stronger hash.)

## Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `KB_DIR` | `~/yuanying/local_kb` | KB root (raw/ + index/) |
| `KB_HOST` / `HOST` | `127.0.0.1` | bind address; `0.0.0.0` for Tailscale/LAN |
| `KB_PORT` | `8080` | service port |
| `KB_TOKEN` | empty | optional bearer auth (recommended with 0.0.0.0) |
| `LOCAL_RAG_URL` | `http://localhost:8080` | how Next.js reaches the service |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | embeddings endpoint |
| `KB_EMBED_MODEL` | `bge-m3` | embedding model |

## Proxy capture

```bash
# point an OpenAI-compatible client at the proxy instead of the provider
UPSTREAM=https://api.deepseek.com KB_SOURCE=deepseek python3 scripts/kb_proxy.py
# client base url: http://127.0.0.1:8787/v1
```

Non-streaming and SSE streaming are both captured (last user message + the new
assistant reply), then written through `/ingest`. Disable with
`KB_PROXY_INGEST=0`.

## Index

The live SQLite file is `~/yuanying/local_kb/index/sqlite.db` and is **not**
committed (private conversations, public repo). Rebuild:

```bash
python3 scripts/local_rag_server.py --reindex        # docs + chunks + embeddings
python3 scripts/local_rag_server.py --embed          # fill missing vectors
```

Schema: `schema/kb.sql`. Tables after rebuild: `kb_docs`, `kb_chunks`,
`kb_fts`, `kb_chunks_fts` (+ FTS5 shadow tables).

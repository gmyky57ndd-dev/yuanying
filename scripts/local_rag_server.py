#!/usr/bin/env python3
"""ES-075: local-first AI knowledge base (files are truth, index is rebuildable).

Endpoints (127.0.0.1:8080):
  GET  /health                    -> {ok, docs, raw, chunks, embedded, model, ollama}
  POST /search {query, limit?}    -> {success, semantic, match, results:[...]}
  POST /ingest {source,model,title,text,tags,summary} -> {success,path,id,embedded}

Storage:
  ~/yuanying/local_kb/raw/<source>/YYYY-MM-DD_HHmm_<hash>.md   (truth)
  ~/yuanying/local_kb/index/sqlite.db                          (FTS5 + vectors)

Schema is designed for a later swap to Chroma/Qdrant: kb_docs / kb_chunks are
plain rows whose (id, text, embedding, model, dim) map 1:1 to a vector store.

Run: python3 scripts/local_rag_server.py [--reindex] [--embed]
"""
import glob
import hashlib
import json
import math
import os
import re
import sqlite3
import sys
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# KB_DIR lets tests/demos build an isolated index (default: the owner's real KB).
KB_DIR = os.path.expanduser(os.environ.get("KB_DIR", "~/yuanying/local_kb"))
RAW_DIR = os.path.join(KB_DIR, "raw")
INDEX_DIR = os.path.join(KB_DIR, "index")
DB_PATH = os.path.join(INDEX_DIR, "sqlite.db")
SOURCES = ("deepseek", "chatgpt", "claude", "manual")
OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
# HOST=0.0.0.0 exposes the KB to the LAN / Tailscale interface (Coolify VPS will
# call it over the tailnet). Default stays loopback.
BIND_HOST = os.environ.get("KB_HOST") or os.environ.get("HOST") or "127.0.0.1"
BIND_PORT = int(os.environ.get("KB_PORT") or os.environ.get("PORT") or "8080")
KB_TOKEN = os.environ.get("KB_TOKEN", "")
EMBED_MODEL = os.environ.get("KB_EMBED_MODEL", "bge-m3")
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


# ---------------------------------------------------------------- storage
def ensure_dirs():
    for sub in SOURCES:
        os.makedirs(os.path.join(RAW_DIR, sub), exist_ok=True)
    os.makedirs(INDEX_DIR, exist_ok=True)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        create table if not exists kb_docs (
          id text primary key, path text unique not null, source text, model text,
          title text, tags text, summary text, created_at text, sha256 text,
          indexed_at text
        );
        create virtual table if not exists kb_fts using fts5(
          path, title, summary, body, tokenize='unicode61'
        );
        create table if not exists kb_chunks (
          id text primary key, doc_path text not null, chunk_index integer not null,
          text text not null, model text, dim integer, embedding blob, updated_at text
        );
        create virtual table if not exists kb_chunks_fts using fts5(
          chunk_id, text, tokenize='unicode61'
        );
        """
    )
    return conn


def parse_frontmatter(text):
    meta, body = {}, text
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            for line in text[3:end].strip().splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
            body = text[end + 4 :].lstrip("\n")
    return meta, body


def chunks_of(text):
    out, start = [], 0
    while start < len(text):
        out.append(text[start : start + CHUNK_SIZE])
        if start + CHUNK_SIZE >= len(text):
            break
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return [c for c in out if c.strip()]


def ollama_ok():
    try:
        with urllib.request.urlopen(OLLAMA + "/api/tags", timeout=1.5) as r:
            return r.status == 200
    except Exception:
        return False


def embed(texts):
    """Return a list of vectors, or None when Ollama/model is unavailable."""
    if not texts:
        return []
    try:
        payload = json.dumps({"model": EMBED_MODEL, "input": texts}).encode()
        req = urllib.request.Request(
            OLLAMA + "/api/embed",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read().decode())
        vectors = data.get("embeddings")
        if not vectors:
            return None
        return vectors
    except Exception:
        return None


def pack(vector):
    return json.dumps([round(float(x), 6) for x in vector]).encode()


def unpack(blob):
    return json.loads(blob.decode()) if blob else None


def cosine(a, b):
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def index_doc(conn, path, do_embed=True):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        raw = f.read()
    meta, body = parse_frontmatter(raw)
    rel = os.path.relpath(path, KB_DIR)
    now = datetime.now(timezone.utc).isoformat()
    doc_id = meta.get("id") or hashlib.sha256(raw.encode()).hexdigest()[:12]

    conn.execute("delete from kb_fts where path = ?", (rel,))
    conn.execute("delete from kb_chunks where doc_path = ?", (rel,))
    conn.execute(
        "insert into kb_chunks_fts (chunk_id, text) select id, text from kb_chunks where doc_path = ?",
        (rel,),
    )  # no-op cleanup in case of stale rows
    conn.execute(
        "insert or replace into kb_docs (id,path,source,model,title,tags,summary,created_at,sha256,indexed_at) "
        "values (?,?,?,?,?,?,?,?,?,?)",
        (
            doc_id, rel, meta.get("source", ""), meta.get("model", ""),
            meta.get("title", os.path.basename(path)), meta.get("tags", ""),
            meta.get("summary", ""), meta.get("created_at", ""),
            hashlib.sha256(body.strip().encode()).hexdigest(), now,
        ),
    )
    conn.execute(
        "insert into kb_fts (path,title,summary,body) values (?,?,?,?)",
        (rel, meta.get("title", ""), meta.get("summary", ""), body),
    )

    parts = chunks_of(body)
    vectors = embed(parts) if (do_embed and parts and ollama_ok()) else None
    for i, part in enumerate(parts):
        cid = hashlib.sha256(f"{rel}:{i}".encode()).hexdigest()[:16]
        vec = vectors[i] if vectors and i < len(vectors) else None
        conn.execute(
            "insert or replace into kb_chunks (id,doc_path,chunk_index,text,model,dim,embedding,updated_at) "
            "values (?,?,?,?,?,?,?,?)",
            (cid, rel, i, part, EMBED_MODEL if vec else None,
             len(vec) if vec else None, pack(vec) if vec else None, now),
        )
        conn.execute("delete from kb_chunks_fts where chunk_id = ?", (cid,))
        conn.execute("insert into kb_chunks_fts (chunk_id,text) values (?,?)", (cid, part))
    conn.commit()
    return {"doc_id": doc_id, "chunks": len(parts), "embedded": bool(vectors)}


def reindex(do_embed=True):
    ensure_dirs()
    conn = db()
    conn.execute("delete from kb_fts")
    conn.execute("delete from kb_chunks")
    conn.execute("delete from kb_chunks_fts")
    conn.commit()
    count = 0
    for path in glob.glob(f"{KB_DIR}/**/*.md", recursive=True):
        if "/index/" in path:
            continue
        try:
            index_doc(conn, path, do_embed=do_embed)
            count += 1
        except Exception as exc:  # noqa: BLE001
            print("index failed", path, exc)
    conn.close()
    return count


def embed_missing():
    conn = db()
    rows = conn.execute(
        "select doc_path from kb_chunks where embedding is null group by doc_path"
    ).fetchall()
    done = 0
    for (doc_path,) in rows:
        path = os.path.join(KB_DIR, doc_path)
        if os.path.exists(path):
            index_doc(conn, path, do_embed=True)
            done += 1
    conn.close()
    return done


def stats():
    conn = db()
    docs = conn.execute("select count(*) from kb_docs").fetchone()[0]
    chunks = conn.execute("select count(*) from kb_chunks").fetchone()[0]
    embedded = conn.execute(
        "select count(*) from kb_chunks where embedding is not null"
    ).fetchone()[0]
    conn.close()
    raw = len(glob.glob(f"{RAW_DIR}/**/*.md", recursive=True))
    return {"docs": docs, "raw": raw, "chunks": chunks, "embedded": embedded}


def keyword_chunks(conn, query, limit=30):
    try:
        return [
            r[0]
            for r in conn.execute(
                "select chunk_id from kb_chunks_fts where kb_chunks_fts match ? "
                "order by bm25(kb_chunks_fts) limit ?",
                (query, limit),
            )
        ]
    except sqlite3.OperationalError:
        return []


def keyword_docs(conn, query, limit=10):
    try:
        return [
            r[0]
            for r in conn.execute(
                "select path from kb_fts where kb_fts match ? order by bm25(kb_fts) limit ?",
                (query, limit),
            )
        ]
    except sqlite3.OperationalError:
        return []


def search(query, limit=5):
    conn = db()
    st = stats()
    semantic_used = False
    qvecs = None
    if st["embedded"] > 0 and ollama_ok():
        qvecs = embed([query])
        semantic_used = bool(qvecs)

    # keyword candidates (chunk level)
    kw = keyword_chunks(conn, query, 30)
    # semantic candidates (all embedded chunks; fine for a personal KB)
    sem = []
    if semantic_used:
        qv = qvecs[0]
        for cid, blob, text in conn.execute(
            "select id, embedding, text from kb_chunks where embedding is not null"
        ):
            score = cosine(qv, unpack(blob))
            sem.append((score, cid))
        sem.sort(reverse=True)
        sem = [cid for score, cid in sem[:30]]

    # reciprocal rank fusion
    rrf = {}
    for rank, cid in enumerate(kw):
        rrf[cid] = rrf.get(cid, 0) + 1 / (60 + rank + 1)
    for rank, cid in enumerate(sem):
        rrf[cid] = rrf.get(cid, 0) + 1 / (60 + rank + 1)
    ranked = [cid for cid, _ in sorted(rrf.items(), key=lambda kv: kv[1], reverse=True)]

    results, seen = [], set()
    for cid in ranked:
        row = conn.execute(
            "select c.doc_path, c.text, d.title, d.summary, d.source "
            "from kb_chunks c join kb_docs d on d.path = c.doc_path where c.id = ?",
            (cid,),
        ).fetchone()
        if not row or row[0] in seen:
            continue
        doc_path, text, title, summary, source = row
        seen.add(doc_path)
        results.append(
            {
                "file": os.path.basename(doc_path),
                "path": doc_path,
                "source": source,
                "title": title,
                "summary": summary,
                "snippet": text[:900],
            }
        )
        if len(results) >= limit:
            break

    # fallback: doc-level keyword (docs/test.md is never chunk-empty, but keep it)
    if not results:
        for path in keyword_docs(conn, query, limit):
            d = conn.execute(
                "select title, summary, source from kb_docs where path = ?", (path,)
            ).fetchone()
            body = conn.execute(
                "select body from kb_fts where path = ?", (path,)
            ).fetchone()
            if d:
                results.append(
                    {
                        "file": os.path.basename(path),
                        "path": path,
                        "source": d[2],
                        "title": d[0],
                        "summary": d[1],
                        "snippet": (body[0] if body else "")[:900],
                    }
                )
    conn.close()
    match = "hybrid" if semantic_used and kw else ("semantic" if semantic_used else "keyword")
    return {
        "success": True,
        "semantic": semantic_used,
        "match": match,
        "results": results,
    }


def ingest(payload):
    ensure_dirs()
    source = str(payload.get("source", "manual")).lower()
    if source not in SOURCES:
        source = "manual"
    text = str(payload.get("text", "")).strip()
    if not text:
        raise ValueError("text required")
    now = datetime.now(timezone.utc)
    full_sha = hashlib.sha256(text.strip().encode()).hexdigest()
    conn = db()
    dup = conn.execute(
        "select path from kb_docs where sha256 = ? and source = ? limit 1",
        (full_sha, source),
    ).fetchone()
    if dup:
        conn.close()
        return {"path": dup[0], "id": "", "duplicate": True, "chunks": 0, "embedded": False}
    digest = full_sha[:8]
    doc_id = f"{now.strftime('%Y%m%d%H%M')}-{digest}"
    folder = os.path.join(RAW_DIR, source)
    path = os.path.join(folder, f"{now.strftime('%Y-%m-%d_%H%M')}_{digest}.md")
    tags = payload.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    meta = {
        "id": doc_id,
        "source": source,
        "model": str(payload.get("model", "")),
        "title": str(payload.get("title") or f"Conversation {now:%Y-%m-%d %H:%M}"),
        "tags": "[" + ", ".join(str(t) for t in tags) + "]",
        "summary": str(payload.get("summary", "")),
        "created_at": now.isoformat(),
    }
    front = "---\n" + "\n".join(f"{k}: {v}" for k, v in meta.items()) + "\n---\n\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(front + text + "\n")
    conn = db()
    info = index_doc(conn, path)
    conn.close()
    return {"path": os.path.relpath(path, KB_DIR), "id": doc_id, **info}


class Handler(BaseHTTPRequestHandler):
    def _authorized(self):
        if not KB_TOKEN:
            return True
        return self.headers.get("Authorization") == f"Bearer {KB_TOKEN}"

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self._authorized():
            return self._json(401, {"success": False, "error": "unauthorized"})
        if self.path != "/health":
            return self._json(404, {"success": False, "error": "not found"})
        return self._json(
            200,
            {"ok": True, **stats(), "model": EMBED_MODEL, "ollama": ollama_ok()},
        )

    def do_POST(self):
        if not self._authorized():
            return self._json(401, {"success": False, "error": "unauthorized"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length).decode() or "{}")
        except Exception as exc:  # noqa: BLE001
            return self._json(400, {"success": False, "error": f"bad request: {exc}"})
        if self.path == "/ingest":
            try:
                return self._json(200, {"success": True, **ingest(data)})
            except Exception as exc:  # noqa: BLE001
                return self._json(400, {"success": False, "error": str(exc)})
        if self.path == "/reindex":
            try:
                files = reindex(True)
                return self._json(200, {"success": True, "files": files, **stats()})
            except Exception as exc:  # noqa: BLE001
                return self._json(500, {"success": False, "error": str(exc)})
        if self.path == "/embed":
            try:
                docs = embed_missing()
                return self._json(200, {"success": True, "embedded_docs": docs, **stats()})
            except Exception as exc:  # noqa: BLE001
                return self._json(500, {"success": False, "error": str(exc)})
        if self.path == "/search":
            query = str(data.get("query", "")).strip()
            if not query:
                return self._json(400, {"success": False, "error": "query required"})
            try:
                return self._json(200, search(query, int(data.get("limit", 5))))
            except Exception as exc:  # noqa: BLE001
                return self._json(500, {"success": False, "error": str(exc)})
        return self._json(404, {"success": False, "error": "not found"})


if __name__ == "__main__":
    ensure_dirs()
    if "--reindex" in sys.argv:
        print(f"reindexed {reindex('--no-embed' not in sys.argv)} files")
        raise SystemExit(0)
    if "--embed" in sys.argv:
        print(f"embedded {embed_missing()} documents")
        raise SystemExit(0)
    stats()
    print(f"Local KB service on {BIND_HOST}:{BIND_PORT} (kb={KB_DIR}, model={EMBED_MODEL}, token={'yes' if KB_TOKEN else 'no'})")
    ThreadingHTTPServer((BIND_HOST, BIND_PORT), Handler).serve_forever()

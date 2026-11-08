#!/usr/bin/env python3
"""ES-075 / ES-078: local-first knowledge base service (no cloud calls).

Endpoints (127.0.0.1:8080):
  GET  /health              -> {ok, docs, raw}
  POST /search {query}      -> {success, results:[{file,path,source,title,summary,snippet}]}
  POST /ingest {source, model, title, text, tags, summary}
                            -> {success, path, id}

Storage:
  ~/yuanying/local_kb/raw/<source>/YYYY-MM-DD_HHmm_<hash>.md  (truth)
  ~/yuanying/local_kb/index/sqlite.db                         (rebuildable FTS5)

Run: python3 scripts/local_rag_server.py [--reindex]
"""
import glob
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KB_DIR = os.path.expanduser("~/yuanying/local_kb")
RAW_DIR = os.path.join(KB_DIR, "raw")
INDEX_DIR = os.path.join(KB_DIR, "index")
DB_PATH = os.path.join(INDEX_DIR, "sqlite.db")
SOURCES = ("deepseek", "chatgpt", "claude", "manual")


def ensure_dirs():
    for sub in ("deepseek", "chatgpt", "claude", "manual"):
        os.makedirs(os.path.join(RAW_DIR, sub), exist_ok=True)
    os.makedirs(INDEX_DIR, exist_ok=True)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "create virtual table if not exists kb using fts5("
        "id, path, source, model, title, tags, summary, body, created_at, tokenize='unicode61')"
    )
    return conn


def parse_frontmatter(text):
    meta = {}
    body = text
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            block = text[3:end].strip()
            body = text[end + 4 :].lstrip("\n")
            for line in block.splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
    return meta, body


def index_file(conn, path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()
    meta, body = parse_frontmatter(text)
    rel = os.path.relpath(path, KB_DIR)
    conn.execute("delete from kb where path = ?", (rel,))
    conn.execute(
        "insert into kb (id,path,source,model,title,tags,summary,body,created_at) "
        "values (?,?,?,?,?,?,?,?,?)",
        (
            meta.get("id", ""),
            rel,
            meta.get("source", ""),
            meta.get("model", ""),
            meta.get("title", os.path.basename(path)),
            meta.get("tags", ""),
            meta.get("summary", ""),
            body,
            meta.get("created_at", ""),
        ),
    )
    conn.commit()


def reindex():
    ensure_dirs()
    conn = db()
    conn.execute("delete from kb")
    count = 0
    for path in glob.glob(f"{KB_DIR}/**/*.md", recursive=True):
        if "/index/" in path:
            continue
        try:
            index_file(conn, path)
            count += 1
        except Exception as exc:  # noqa: BLE001
            print("index failed", path, exc)
    conn.close()
    return count


def rows_count():
    conn = db()
    n = conn.execute("select count(*) from kb").fetchone()[0]
    conn.close()
    return n


def search(query, limit=3):
    conn = db()
    results = []
    try:
        for row in conn.execute(
            "select path, source, title, summary, body from kb "
            "where kb match ? order by bm25(kb) limit ?",
            (query, limit),
        ):
            results.append(row)
    except sqlite3.OperationalError:
        results = []
    if not results:
        like = f"%{query}%"
        for row in conn.execute(
            "select path, source, title, summary, body from kb "
            "where body like ? or summary like ? or title like ? limit ?",
            (like, like, like, limit),
        ):
            results.append(row)
    conn.close()

    out = []
    needle = query.lower()
    for path, source, title, summary, body in results:
        idx = body.lower().find(needle)
        if idx < 0:
            words = [w for w in re.split(r"\s+", needle) if w]
            positions = [body.lower().find(w) for w in words if body.lower().find(w) >= 0]
            idx = min(positions) if positions else 0
        snippet = body[max(0, idx - 400) : min(len(body), idx + 900)]
        out.append(
            {
                "file": os.path.basename(path),
                "path": path,
                "source": source,
                "title": title,
                "summary": summary,
                "snippet": snippet,
            }
        )
    return out


def ingest(payload):
    ensure_dirs()
    source = str(payload.get("source", "manual")).lower()
    if source not in SOURCES:
        source = "manual"
    text = str(payload.get("text", "")).strip()
    if not text:
        raise ValueError("text required")
    now = datetime.now(timezone.utc)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]
    doc_id = f"{now.strftime('%Y%m%d%H%M')}-{digest}"
    filename = f"{now.strftime('%Y-%m-%d_%H%M')}_{digest}.md"
    folder = os.path.join(RAW_DIR, source)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, filename)

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
    index_file(conn, path)
    conn.close()
    return {"path": os.path.relpath(path, KB_DIR), "id": doc_id}


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            return self._json(404, {"success": False, "error": "not found"})
        raw_files = len(glob.glob(f"{RAW_DIR}/**/*.md", recursive=True))
        return self._json(200, {"ok": True, "docs": rows_count(), "raw": raw_files})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except Exception as exc:  # noqa: BLE001
            return self._json(400, {"success": False, "error": f"bad request: {exc}"})

        if self.path == "/ingest":
            try:
                return self._json(200, {"success": True, **ingest(data)})
            except Exception as exc:  # noqa: BLE001
                return self._json(400, {"success": False, "error": str(exc)})

        if self.path == "/search":
            query = str(data.get("query", "")).strip()
            if not query:
                return self._json(400, {"success": False, "error": "query required"})
            try:
                return self._json(200, {"success": True, "results": search(query)})
            except Exception as exc:  # noqa: BLE001
                return self._json(500, {"success": False, "error": str(exc)})

        return self._json(404, {"success": False, "error": "not found"})


if __name__ == "__main__":
    ensure_dirs()
    if "--reindex" in sys.argv:
        print(f"reindexed {reindex()} files")
        raise SystemExit(0)
    rows_count()
    print(f"Local KB service on 127.0.0.1:8080 (kb={KB_DIR})")
    ThreadingHTTPServer(("127.0.0.1", 8080), Handler).serve_forever()

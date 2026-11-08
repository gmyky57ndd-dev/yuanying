#!/usr/bin/env python3
"""ES-078: minimal local RAG service (keyword retrieval, no cloud calls).

POST /search {"query": "..."} -> {"success": true, "results": [{file, snippet}]}
GET  /health                -> {"ok": true, "files": N}

DEVIATION: the task document matches the raw query substring only, which misses
normal Chinese questions (e.g. "部署计划是什么" does not occur in the file).
We tokenise the query on whitespace/punctuation and score documents by token
hits; the exact-query match still ranks first. Still keyword-only, no vectors.
"""
import glob
import json
import os
import re
from http.server import BaseHTTPRequestHandler, HTTPServer

KB_DIR = os.path.expanduser("~/yuanying/local_kb")
MAX_RESULTS = 3
MAX_SNIPPET = 1500


def kb_files():
    return glob.glob(f"{KB_DIR}/**/*.md", recursive=True) + glob.glob(
        f"{KB_DIR}/**/*.txt", recursive=True
    )


def tokens(query):
    parts = re.split(r"[\s,，。？?！!、；;:：]+", query.lower())
    return [p for p in parts if len(p) >= 1]


class RAGHandler(BaseHTTPRequestHandler):
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
        return self._json(200, {"ok": True, "files": len(kb_files())})

    def do_POST(self):
        if self.path != "/search":
            return self._json(404, {"success": False, "error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            query = str(data.get("query", "")).strip()
        except Exception as exc:  # malformed body
            return self._json(400, {"success": False, "error": f"bad request: {exc}"})

        if not query:
            return self._json(400, {"success": False, "error": "query required"})

        needle = query.lower()
        words = tokens(query)
        scored = []
        for filepath in kb_files():
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    text = f.read()
            except Exception:
                continue
            low = text.lower()
            score = 0
            idx = low.find(needle)
            if idx >= 0:
                score += 100
            for word in words:
                if word and word in low:
                    score += low.count(word)
            if score == 0:
                continue
            if idx < 0:
                positions = [low.find(w) for w in words if w and low.find(w) >= 0]
                idx = min(positions) if positions else 0
            snippet = text[max(0, idx - 500): min(len(text), idx + 1000)]
            scored.append({"file": os.path.basename(filepath), "snippet": snippet, "score": score})

        scored.sort(key=lambda item: item["score"], reverse=True)
        for item in scored:
            item.pop("score", None)
        return self._json(200, {"success": True, "results": scored[:MAX_RESULTS]})


if __name__ == "__main__":
    print(f"Local RAG Server running on port 8080 (kb={KB_DIR})")
    HTTPServer(("127.0.0.1", 8080), RAGHandler).serve_forever()

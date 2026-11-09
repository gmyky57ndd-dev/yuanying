#!/usr/bin/env python3
"""ES-079: API proxy sidecar that captures chat completions into the local KB.

Point your client at http://127.0.0.1:8787 instead of the provider; the proxy
forwards unchanged (including SSE streaming) and, on completion, ingests the
last user message + the assistant reply into the local KB.

Env:
  UPSTREAM=https://api.deepseek.com   provider base URL
  KB_PROXY_PORT=8787                  listen port
  KB_SOURCE=deepseek                  source tag for ingestion
  LOCAL_RAG_URL=http://localhost:8080 local KB service
  KB_TOKEN=                           bearer for the local service
  KB_PROXY_INGEST=0                   disable capture
"""
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = os.environ.get("UPSTREAM", "https://api.deepseek.com").rstrip("/")
PORT = int(os.environ.get("KB_PROXY_PORT", "8787"))
SOURCE = os.environ.get("KB_SOURCE", "deepseek")
KB_URL = os.environ.get("LOCAL_RAG_URL", "http://localhost:8080").rstrip("/")
KB_TOKEN = os.environ.get("KB_TOKEN", "")
CAPTURE = os.environ.get("KB_PROXY_INGEST", "1") != "0"


def ingest(user_text, assistant_text, model=""):
    if not CAPTURE or not user_text or not assistant_text:
        return
    payload = {
        "source": SOURCE,
        "model": model,
        "title": user_text.strip().splitlines()[0][:60],
        "summary": assistant_text.strip().replace("\n", " ")[:160],
        "tags": ["proxy", SOURCE],
        "text": f"## {user_text.strip().splitlines()[0][:60]}\n\n**我**：{user_text}\n\n**AI**：{assistant_text}\n",
    }
    req = urllib.request.Request(
        KB_URL + "/ingest",
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {KB_TOKEN}"} if KB_TOKEN else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            r.read()
    except Exception as exc:  # noqa: BLE001
        print(f"proxy ingest failed: {exc}", file=sys.stderr)


def last_user(messages):
    for msg in reversed(messages or []):
        if isinstance(msg, dict) and msg.get("role") == "user":
            content = msg.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return "\n".join(
                    str(p.get("text", "")) for p in content if isinstance(p, dict)
                )
    return ""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _proxy(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            body = {}
        user_text = last_user(body.get("messages"))
        stream = body.get("stream") is True
        model = str(body.get("model", ""))

        req = urllib.request.Request(
            UPSTREAM + self.path,
            data=raw,
            headers={
                k: v
                for k, v in self.headers.items()
                if k.lower() in ("authorization", "content-type", "accept")
            },
            method="POST",
        )
        try:
            upstream = urllib.request.urlopen(req, timeout=300)
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            self.send_response(exc.code)
            self.send_header("Content-Type", exc.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if not stream:
            payload = upstream.read()
            try:
                data = json.loads(payload.decode())
                text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
                ingest(user_text, text, model)
            except Exception:  # noqa: BLE001
                pass
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        # SSE: relay line by line and accumulate the assistant text.
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        parts = []
        try:
            while True:
                line = upstream.readline()
                if not line:
                    break
                self.wfile.write(line)
                self.wfile.flush()
                if line.startswith(b"data: "):
                    chunk = line[6:].strip()
                    if chunk == b"[DONE]":
                        break
                    try:
                        obj = json.loads(chunk.decode())
                        delta = (obj.get("choices") or [{}])[0].get("delta", {})
                        if delta.get("content"):
                            parts.append(delta["content"])
                    except Exception:  # noqa: BLE001
                        pass
        finally:
            ingest(user_text, "".join(parts), model)

    do_POST = _proxy

    def log_message(self, fmt, *args):  # quiet-ish
        print(f"[proxy] {fmt % args}", file=sys.stderr)


if __name__ == "__main__":
    print(f"KB proxy on 127.0.0.1:{PORT} -> {UPSTREAM} (source={SOURCE}, capture={CAPTURE})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

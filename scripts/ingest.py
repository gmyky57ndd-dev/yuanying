#!/usr/bin/env python3
"""ES-079: single-document ingest CLI for the local KB.

Examples:
  python3 scripts/ingest.py --file ~/Downloads/export.json --source deepseek
  python3 scripts/ingest.py --text "..." --title "MCP notes" --tags mcp,arch
  python3 scripts/ingest.py --stdin --source manual < notes.md
"""
import argparse
import json
import os
import sys
import urllib.request

DEFAULT_URL = os.environ.get("LOCAL_RAG_URL", "http://localhost:8080").rstrip("/")
TOKEN = os.environ.get("KB_TOKEN", "")


def post(url, payload):
    req = urllib.request.Request(
        url + "/ingest",
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def main():
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--file")
    src.add_argument("--text")
    src.add_argument("--stdin", action="store_true")
    ap.add_argument("--source", default="manual",
                    choices=["deepseek", "chatgpt", "claude", "manual"])
    ap.add_argument("--title", default="")
    ap.add_argument("--summary", default="")
    ap.add_argument("--tags", default="")
    ap.add_argument("--url", default=DEFAULT_URL)
    args = ap.parse_args()

    if args.file:
        with open(os.path.expanduser(args.file), "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
    elif args.stdin:
        text = sys.stdin.read()
    else:
        text = args.text
    text = (text or "").strip()
    if not text:
        print("empty input", file=sys.stderr)
        return 2

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    try:
        res = post(args.url, {
            "source": args.source,
            "title": args.title or None,
            "summary": args.summary,
            "tags": tags,
            "text": text,
        })
    except Exception as exc:  # noqa: BLE001
        print(f"local KB service unreachable at {args.url}: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(res, ensure_ascii=False))
    return 0 if res.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())

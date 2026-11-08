#!/usr/bin/env python3
"""ES-075: import DeepSeek/ChatGPT/Claude exports into the local KB.

The raw conversation becomes a Markdown file on this machine (via the local KB
service `/ingest`), never a Supabase row.

Usage:
  python3 scripts/kb_collect.py --input ~/Downloads/deepseek_export.json
  python3 scripts/kb_collect.py --input ~/Downloads/exports --source auto --dry-run
  LOCAL_RAG_URL=http://127.0.0.1:8080 python3 scripts/kb_collect.py ...

Supported shapes:
  - JSON list of conversations, or {"conversations"|"data"|"chats"|"sessions":[...]}
  - Each conversation: messages[] / chat_messages[] / mapping (ChatGPT tree)
  - JSONL (one conversation per line)
  - .md/.txt (ingested as a single manual document)
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_URL = os.environ.get("LOCAL_RAG_URL", "http://localhost:8080").rstrip("/")
TOKEN = os.environ.get("KB_TOKEN", "")


def read_json(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read().strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def read_jsonl(path):
    items = []
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return items


def content_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
        return "\n".join(p for p in parts if p)
    if isinstance(value, dict):
        return str(value.get("text") or value.get("content") or "")
    return ""


def linearize_mapping(mapping):
    """ChatGPT export: walk parent/child from the root, keep user/assistant."""
    if not isinstance(mapping, dict):
        return []
    children = {}
    for node_id, node in mapping.items():
        if not isinstance(node, dict):
            continue
        parent = node.get("parent")
        children.setdefault(parent, []).append(node_id)
    root = children.get(None)
    if not root:
        return []
    out, stack = [], list(root)
    seen = set()
    while stack:
        node_id = stack.pop(0)
        if node_id in seen:
            continue
        seen.add(node_id)
        node = mapping.get(node_id) or {}
        msg = node.get("message") or {}
        role = (msg.get("author") or {}).get("role")
        text = content_text((msg.get("content") or {}).get("parts"))
        if role in ("user", "assistant") and text.strip():
            out.append((role, text.strip()))
        stack[0:0] = children.get(node_id, [])
    return out


def conversation_messages(conv):
    if not isinstance(conv, dict):
        return []
    for key in ("messages", "chat_messages", "conversation"):
        items = conv.get(key)
        if isinstance(items, list):
            out = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                role = item.get("role") or (item.get("author") or {}).get("role") or "user"
                text = content_text(item.get("content") or item.get("text") or item.get("message"))
                if text.strip():
                    out.append((str(role), text.strip()))
            if out:
                return out
    if isinstance(conv.get("mapping"), dict):
        return linearize_mapping(conv["mapping"])
    return []


def conversation_title(conv, messages):
    if isinstance(conv, dict):
        for key in ("title", "name", "subject"):
            if conv.get(key):
                return str(conv[key])[:120]
    for role, text in messages:
        if role == "user":
            return text.strip().replace("\n", " ")[:60]
    return "Conversation"


def conversation_summary(messages):
    for role, text in messages:
        if role == "assistant":
            return text.strip().replace("\n", " ")[:160]
    return ""


def to_markdown(title, messages):
    lines = [f"## {title}", ""]
    for role, text in messages:
        label = {"user": "**我**", "assistant": "**AI**"}.get(role, f"**{role}**")
        lines.append(f"{label}：{text}")
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def extract_conversations(data, path):
    """Return a list of (title, messages, source_hint)."""
    if isinstance(data, list):
        convs = data
    elif isinstance(data, dict):
        convs = None
        for key in ("conversations", "data", "chats", "sessions"):
            if isinstance(data.get(key), list):
                convs = data[key]
                break
        if convs is None:
            convs = [data]
    else:
        return []
    out = []
    for conv in convs:
        messages = conversation_messages(conv)
        if not messages:
            continue
        out.append((conversation_title(conv, messages), messages))
    return out


def post_ingest(url, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url + "/ingest",
        data=body,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="file or directory")
    ap.add_argument("--source", default="auto", choices=["auto", "deepseek", "chatgpt", "claude", "manual"])
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    paths = []
    if os.path.isdir(args.input):
        for root, _, files in os.walk(args.input):
            for name in files:
                if name.lower().endswith((".json", ".jsonl", ".md", ".txt")):
                    paths.append(os.path.join(root, name))
    else:
        paths.append(args.input)

    stats = {"files": 0, "parsed": 0, "ingested": 0, "duplicate": 0, "failed": 0, "skipped": 0}
    for path in sorted(paths):
        stats["files"] += 1
        name = os.path.basename(path).lower()
        source = args.source
        if source == "auto":
            for candidate in ("deepseek", "chatgpt", "claude"):
                if candidate in name or candidate in path.lower():
                    source = candidate
                    break
            else:
                source = "manual"

        if name.endswith((".md", ".txt")):
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read().strip()
            if not text:
                stats["skipped"] += 1
                continue
            payload = {
                "source": source,
                "title": os.path.splitext(os.path.basename(path))[0][:120],
                "summary": "",
                "tags": ["import"],
                "text": text,
            }
            conversations = [(payload["title"], payload["text"])]
            kind = "text"
        else:
            if name.endswith(".jsonl"):
                items = read_jsonl(path)
                data = items
            else:
                data = read_json(path)
            if data is None:
                print(f"! cannot parse {path}", file=sys.stderr)
                stats["failed"] += 1
                continue
            conversations = extract_conversations(data, path)
            kind = "json"

        for title, messages in conversations:
            if kind == "text":
                markdown = messages
                summary = ""
            else:
                markdown = to_markdown(title, messages)
                summary = conversation_summary(messages)
            stats["parsed"] += 1
            if args.limit and stats["parsed"] > args.limit:
                break
            if args.dry_run:
                print(f"[dry] {title} ({len(markdown)} chars) -> {source}")
                continue
            try:
                res = post_ingest(
                    args.url,
                    {
                        "source": source,
                        "title": title,
                        "summary": summary,
                        "tags": ["import", source],
                        "text": markdown,
                    },
                )
                if res.get("duplicate"):
                    stats["duplicate"] += 1
                    print(f"= duplicate {title}")
                elif res.get("success"):
                    stats["ingested"] += 1
                    print(f"+ {res.get('path')} ({'embedded' if res.get('embedded') else 'no-embed'})")
                else:
                    stats["failed"] += 1
                    print(f"! {title}: {res.get('error')}", file=sys.stderr)
            except urllib.error.URLError as exc:
                print(f"! KB service unreachable at {args.url}: {exc}", file=sys.stderr)
                return 2
            except Exception as exc:  # noqa: BLE001
                stats["failed"] += 1
                print(f"! {title}: {exc}", file=sys.stderr)

    print(json.dumps(stats, ensure_ascii=False))
    return 0 if stats["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

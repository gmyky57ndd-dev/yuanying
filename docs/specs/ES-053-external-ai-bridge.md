# ES-053 — External AI Bridge & Context Ingestion

**Status**: Approved
**Category**: Feature (Tool Integration / Multi-Agent)
**Tracking**: P3-05

## 1. Goal

Stop the owner from being a human clipboard router between external AI design
partners and 元婴.

## 2. External conversation memory

- Table `external_chats` with `source`, `content`, `created_at`, and a generated
  `tsvector` index (migration 022).
- Tool `ingest_external_chat(source, content)` saves a long external chat.
- Tool `query_external_chats(query)` uses full-text search, with an `ilike`
  fallback for queries that tokenize poorly (e.g. Chinese).
- Silent mode returns counts/excerpts; verbose mode follows the 800-char cap.

## 3. Clipboard bridge

- Settings → **外部 AI 记忆 → 吸收剪贴板** reads the clipboard and posts to
  `/api/external-chats`.
- Mac shortcut: `Cmd+Shift+V` on Home does the same without opening Settings.
- Source label is `clipboard`.

## 4. Optional Claude bridge

- Tool `ask_claude(prompt)` uses `ANTHROPIC_API_KEY` and
  `claude-3-5-sonnet-latest`.
- If the key is missing, the tool returns `success:false` with a clear reason.
- It is a second opinion, not an autonomous external action.

## 5. Acceptance

- [x] Long pasted text can be saved via the tool or `/api/external-chats`.
- [x] Imported chats can be retrieved by keyword/full-text.
- [x] Clipboard button + `Cmd+Shift+V` shortcut wired.
- [x] `ask_claude` is available only when configured.
- [ ] Owner confirms a real external chat import and retrieval.

## 6. MCP architecture (phase update)

The same ES-053 now also covers the MCP bridge:

### Phase A — mailbox files
- `mailbox/inbox/`, `mailbox/outbox/`.
- Tools `read_local_file(path)` / `write_local_file(path, content)`, restricted
  to `mailbox/**` with `.md/.txt/.json`.
- Production writes go through the GitHub Contents API and create a commit; the
  deploy workflow ignores `mailbox/**`, so mailbox updates do not redeploy.

### Phase B — Yuanying MCP Server
- `POST /api/mcp` (Streamable HTTP, JSON response).
- Auth: `Authorization: Bearer <MCP_TOKEN>` (falls back to `API_TOKEN`).
- Tools: `get_notes`, `get_conversation_records`, `get_summary`,
  `query_external_chats`, `read_local_file`, `write_local_file`,
  `get_body_status`.
- `mcp-config.json` + `docs/runbooks/mcp-bridge.md` for Claude Desktop/Cursor.

### Phase C — MCP Client
- `ask_external_agent(role, prompt)` connects to `MCP_EXTERNAL_URL` and calls the
  first tool matching `ask|chat|prompt|agent`.
- Requires `MCP_EXTERNAL_URL` (and optional `MCP_EXTERNAL_TOKEN`).

### Additional acceptance
- [x] `mcp-config.json` exists.
- [x] `read_local_file` / `write_local_file` work on the mailbox.
- [x] MCP `initialize`, `tools/list`, and `tools/call` verified locally.
- [x] `ask_external_agent` wired; requires an external MCP URL.

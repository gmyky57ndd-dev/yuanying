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

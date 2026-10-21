# Yuanying Mailbox

A simple file-based exchange for external AI tools.

- `inbox/` — messages for 元婴.
- `outbox/` — drafts or replies from 元婴.

Files are Markdown/text/JSON only. 元婴 reads and writes them through
`read_local_file` / `write_local_file`, backed by Git commits. See
`docs/runbooks/mcp-bridge.md`.

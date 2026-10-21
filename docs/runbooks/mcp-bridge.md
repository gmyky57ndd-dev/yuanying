# MCP Bridge

**ES**: ES-053
**Endpoint**: `POST https://yuanying-rust.vercel.app/api/mcp`

## 1. Auth

Set a server secret:

```env
MCP_TOKEN=<a long random string>
```

If `MCP_TOKEN` is absent, `/api/mcp` falls back to `API_TOKEN`. External clients
send:

```http
Authorization: Bearer <MCP_TOKEN>
```

## 2. Claude Desktop / Cursor config

A remote Streamable HTTP entry is in `mcp-config.json`:

```json
{
  "mcpServers": {
    "yuanying": {
      "url": "https://yuanying-rust.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer REPLACE_WITH_MCP_TOKEN"
      }
    }
  }
}
```

If your client only supports stdio servers, bridge the remote endpoint with
`mcp-remote`:

```json
{
  "mcpServers": {
    "yuanying": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://yuanying-rust.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer REPLACE_WITH_MCP_TOKEN"
      ]
    }
  }
}
```

Copy the relevant block into `claude_desktop_config.json`, replacing the token.

## 3. Exposed tools

- `get_notes(date)`
- `get_conversation_records(keyword)`
- `get_summary(date)`
- `query_external_chats(query)`
- `read_local_file(path)`
- `write_local_file(path, content)`
- `get_body_status()`

## 4. Mailbox (Phase A)

Files live under `mailbox/` in the repo:

- `mailbox/inbox/` — messages for 元婴.
- `mailbox/outbox/` — messages from 元婴.

`read_local_file`/`write_local_file` are restricted to `mailbox/**` with
`.md`, `.txt`, or `.json`. Writes go through the GitHub Contents API and create
a commit (`chore(mailbox): ... via MCP`). The deploy workflow ignores
`mailbox/**`, so mailbox updates do not redeploy the PWA.

## 5. External agent (Phase C)

Set:

```env
MCP_EXTERNAL_URL=https://your-mcp-server.example/mcp
MCP_EXTERNAL_TOKEN=
```

Then 元婴 can call `ask_external_agent(role, prompt)`. The client picks the
first tool whose name contains `ask`, `chat`, `prompt`, or `agent`, and forwards
`{ role, prompt }`.

## 6. Verify

```bash
curl -i -X POST https://yuanying-rust.vercel.app/api/mcp \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

A `200` with an MCP initialize response means the endpoint is reachable.

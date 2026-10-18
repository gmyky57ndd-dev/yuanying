# ES-022 — Phase 1 Agentic Tools (Function Calling)

**Status**: Approved
**Category**: Feature (Architecture)
**Tracking**: P1-51
**Depends on**: ES-020 (Tool Calling Setup), ES-021 (Proactive Prompting)

## 1. The Goal

Transition 元婴 from a passive chatbot (which only sees what is injected into the
prompt) to an active Agent (which uses Tools to fetch data and act on the
world). We will achieve this using DeepSeek's Function Calling API.

## 2. The Implementation Loop (`app/api/chat/route.ts`)

When sending a message to DeepSeek, pass the `tools` array.

If DeepSeek returns a `tool_calls` object instead of text:

1. Intercept the tool call in the backend.
2. Execute the corresponding database or API logic.
3. Append the result to the `messages` array as
   `{ role: 'tool', content: JSON.stringify(result) }`.
4. Call DeepSeek again with the new context so it can generate the final text
   response.

## 3. The Approved Tools (法宝)

We will implement exactly three tools in Phase 1.

### Tool 1: `get_notes(date)`

**Purpose**: Allows 元婴 to read the owner's notes for a specific day to
understand context, mood, and projects.

**Schema**:

```json
{
  "name": "get_notes",
  "description": "Fetch notes for a specific date. Use this when the user asks about a specific day, yesterday's thoughts, or what they worked on.",
  "parameters": {
    "type": "object",
    "properties": {
      "date": { "type": "string", "description": "Date in YYYY-MM-DD format (e.g., 2026-10-17)" }
    },
    "required": ["date"]
  }
}
```

**Backend Logic**: Query the notes table in Supabase where
`created_at::date = target_date`. Return an array of note objects (timestamp,
text, tags).

### Tool 2: `get_conversation_records(keyword)`

**Purpose**: Allows 元婴 to search past AI design conversations to recall
architectural decisions (e.g., "How did we decide on the Fenshen
architecture?").

**Schema**:

```json
{
  "name": "get_conversation_records",
  "description": "Search AI conversation memory files for a keyword. Use this to recall past design discussions or specs.",
  "parameters": {
    "type": "object",
    "properties": {
      "keyword": { "type": "string", "description": "The topic, project name, or keyword to search for (e.g., 'Fenshen', 'ES-013')" }
    },
    "required": ["keyword"]
  }
}
```

**Backend Logic**: Search the `memory/conversations/` folder (or Supabase
table) for files matching the keyword. Return the file names and the distilled
content.

### Tool 3: `push_to_dev(title, body)`

**Purpose**: Allows 元婴 to autonomously file bug reports or feedback directly
to the GitHub repo without the owner acting as a middleman.

**Schema**:

```json
{
  "name": "push_to_dev",
  "description": "Create a GitHub issue for the dev team. Use this when the user identifies a bug or wants to send feedback to dev.",
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "Short, descriptive title" },
      "body": { "type": "string", "description": "Detailed issue description including problem, findings, and suggestions." }
    },
    "required": ["title", "body"]
  }
}
```

**Backend Logic**: Call the existing `/api/integrations/github` logic to create
an issue. Return `{ "success": true, "issue_url": "..." }`.

## 4. The Forbidden Tools (红线)

Do NOT implement these tools in Phase 1 or Phase 2.

- ❌ `send_email()` / `send_message()`: 元婴 can draft emails, but it cannot
  send them. Communication with the outside world requires final human
  approval (Confirm before action).
- ❌ `write_code()` / `execute_code()`: 元婴 cannot modify the repo or run
  scripts directly. It can only push suggestions/bugs.
- ❌ `access_bank()` / `make_payment()`: Zero financial access.
- ❌ `delete_data()` / `drop_table()`: Destructive actions must never be
  autonomous.

## 5. System Manifest Update (`core/system-manifest.md`)

Dev must inject the following into the system prompt so 元婴 knows it has
hands:

```markdown
## 你的工具 (Your Tools)
你现在拥有了主动调用的工具。遇到以下情况，**必须**先调用工具再回答：
1. 当主人问你某一天的笔记时，调用 `get_notes(date)`。
2. 当主人问你过去的架构决定时，调用 `get_conversation_records(keyword)`。
3. 当你发现一个系统 bug 或主人让你反馈给 dev 时，调用 `push_to_dev(title, body)`。

不要去猜，去查。如果没有工具结果，说“我没查到”，而不是“我不知道”。
```

## 6. Acceptance Criteria

- [ ] 元婴 can successfully trigger `get_notes` when asked
      "昨天我写了什么笔记？", and the final response includes actual note
      content.
- [ ] 元婴 can successfully trigger `get_conversation_records` when asked
      "我们是怎么决定Fenshen架构的？", and the final response quotes the
      ES-013 spec.
- [ ] 元婴 can successfully trigger `push_to_dev` when told
      "把这个bug发给dev", and a GitHub issue is created.
- [ ] The agent loop handles errors gracefully (e.g., if tool execution fails,
      元婴 says "我尝试查了，但系统报错").

---

## Handoff to Dev

```text
# Work Order: ES-022 Phase 1 Tools (Function Calling)

We are giving Yuanying hands (Tools).
1. Read ES-022.
2. Implement the DeepSeek `tools` array in `app/api/chat/route.ts`.
3. Implement the backend execution loop (`tool_calls` -> DB query -> `role: 'tool'` -> LLM).
4. Implement the three approved tools: `get_notes`, `get_conversation_records`, `push_to_dev`.
5. Update `core/system-manifest.md` with the Tool instructions.
6. Do NOT implement the forbidden tools.

Update TRACKING (P1-51). Reply in TRACKING when the loop is working.
```

> **Tracking note**: P1-51 is already ES-013 (Fenshen architecture). This work
> is recorded under **P1-53** in `TRACKING.md`.

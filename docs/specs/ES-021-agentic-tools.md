# ES-021 — Enable Agentic Tools for 元婴 (Function Calling)

**Status**: Approved
**Category**: Feature (Architecture)
**Tracking**: P1-49

## 1. The Problem

元婴 is blind to anything not manually injected into the prompt. It cannot query
past notes, past conversations, or specific summaries. It needs tools.

## 2. Tool Definitions (DeepSeek API)

`app/api/chat/route.ts` sends a `tools` array:

- `get_notes(date)` — notes for a specific date (YYYY-MM-DD).
- `get_conversation_records(keyword)` — search distilled AI conversation
  records for a keyword.
- `get_summary(date)` — the daily summary for a date.

## 3. The Backend Loop

1. Send the user message + tools to DeepSeek.
2. If DeepSeek returns `tool_calls`, execute the query (Supabase / filesystem).
3. Append the assistant tool-call message + `role: "tool"` results and call
   DeepSeek again (bounded loop).
4. Return the final text.

## 4. System Manifest Update

`core/system-manifest.md` gains a **Tools (法术)** section so 元婴 knows the
tools exist.

## 5. Acceptance

- [ ] "昨天我写了什么笔记？" → `get_notes` → actual notes.
- [ ] "我们之前关于 Fenshen 是怎么决定的？" → `get_conversation_records` →
      the distilled decision.

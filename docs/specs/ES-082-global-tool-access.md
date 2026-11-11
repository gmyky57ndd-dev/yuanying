# ES-082 — Global Tool Access & Hard Tool Call Enforcement

- **Status:** In Progress (2026-11-11). **Tracking:** P2-65.
- **Numbering:** the evening pipeline moved ES-082 → **ES-086**.

## 1. Global tool access

- `fenshen.has_all_tools boolean not null default true`.
- Router: `has_all_tools=true` → inject **all** tool schemas, ignoring the
  whitelist. `false` → the existing whitelist filter (strict isolation).
- Default true for every existing fenshen; the whitelist remains editable for
  future strict isolation.

## 2. Tool calling

- Highest-priority prompt rule: to write a file / create an issue, emit the
  `tool_call` in the same turn; never say “我将去执行 / 模型未发起调用”.
- Textual fallback: `<tool_call>name({…})</tool_call>` and
  `name(path="…", content="…")` are parsed and executed as real calls when the
  tool is active.
- Forced execution: a local-note write intent with no executed call triggers one
  `toolChoice` call; the reply is generated from the real result.

## 3. UI

- Tool status text while sending (“正在写入本地文件…”); failures surface as a
  toast/alert, not as model prose claiming it has no permission.

## 4. Acceptance

- [x] Any fenshen can “写一份笔记到本地” successfully. Evidence: ai_architect
      `has_all_tools=true active_tools=31` wrote
      `local_kb/docs/es082-acceptance-3.md` (103 chars).
- [x] No “我没有权限” / “模型未发起调用”: a verified write returns
      「已写入：…」; failures are rewritten to 「工具执行失败…」 and alerted.

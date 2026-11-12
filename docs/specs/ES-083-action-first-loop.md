# ES-083 — Enforce “Action-First” Agent Loop

- **Status:** Done (2026-11-11, merged #98). **Tracking:** P2-66.
- **Numbering:** the RAG skeleton moved ES-083 → **ES-087**.

## 1. Rule (highest priority)

In `core/system-manifest.md`, `AGENTS.md` and the runtime prompt:

- If you decide to write a file, create an issue, or read data, emit the
  `tool_call` in the same reply.
- Never stop at “我现在去写 / 稍等 / 我准备…” without a tool call.
- Only stop for genuine missing permission or destructive actions.

## 2. Enforcement

- Backend: write intents without a tool result trigger one forced `toolChoice`
  call; otherwise the reply is a deterministic failure, never “模型未发起调用”.
- UI: long tool work shows a status; errors are surfaced as a toast.

## 3. Acceptance

- [x] “写一份笔记到本地” executes without a second confirmation turn
      (ai_architect wrote the file in one request; the reply was the real path).
- [x] Chat never contains “我没有权限” / “模型未发起调用” (server rewrites the
      reply; the client alerts on「工具执行失败」).

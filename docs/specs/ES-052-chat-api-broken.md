# ES-052 — Hotfix: Chat API Broken After Upgrade

**Status**: Urgent Bug (P0)
**Category**: Bug (Backend / Frontend Bridge)
**Tracking**: P3-06
**Refs**: ES-049, ES-051

## 1. Problem

After the latest deploy, some chats returned
`…（没有收到回复，请重试）` with no text. The server log showed
`empty model reply { pushToDev: false }`: the model ended a turn with only tool
calls and no final user-facing text. Stale history also caused version answers
to use old PWA/Collector values.

## 2. Fixes

- `maxSteps` raised from 3 to 5 so tool loops have room to finish with text.
- Runtime prompt: after a tool result, answer in one or two sentences; never end
  with only a tool call.
- Per-request **authoritative Body Status** reminder with current PWA/LLM/
  Collector versions, so history cannot override version answers.
- `onFinish` persists a fallback if text is empty and appends an
  `assistant_text` data part; the client uses that text instead of showing
  “信号中断”.
- Client fallback changed to “没有收到回复，请重试” and sets the error banner.
- `Body Status` now reads `package.json` directly through
  `lib/app-version.ts`.

## 3. Acceptance

- [x] Normal chat returns text in production.
- [x] Version questions return PWA v0.2.0 / LLM / Collector v1.0.31.
- [x] Empty model turns produce a visible server fallback, not a silent stream.
- [x] 29/29 tests at the time; suite now 31/31 after external-chat tests.
- [ ] Owner confirms Mac + Android PWA chat and `push_to_dev`/`get_notes`.

# ES-045 — Fix Agentic Tool Call Loop Freeze

**Status**: Urgent Bug (P0)
**Category**: Backend / Frontend Stream
**Tracking**: P2-26
**Refs**: Issue #50, ES-044

## 1. Problem

The model can loop on text like “我刚才没调用工具，现在调用” without emitting a
real tool call or GitHub request. The UI can also keep showing intermediate
text and never give the user a clean reset path.

## 2. Fixes

- **Prompt purification**: never output promise text. Either emit the tool call
  or report failure. No apology loops.
- **Stream handling**: `push_to_dev` emits `sending` / `done` data parts; the UI
  shows a GitHub-specific loading bubble. The server executes tools (the client
  does not execute them).
- **Reset Chat**: a **重置** button calls `POST /api/chat/reset`, sets
  `config.chat_reset_at`, clears the local messages, generates a new session ID,
  and reloads. The chat route excludes messages older than `chat_reset_at` from
  history, breaking context pollution.
- **Input language**: a `中/EN` toggle next to the chat input switches the input
  `lang`, `autoCorrect`, `autoCapitalize`, and `spellCheck` hints. The choice is
  stored in `localStorage`.

## 3. Files

- `lib/yuanying.ts`, `core/system-manifest.md` — no-promise rule.
- `app/api/chat/route.ts` — reset-aware history, tool lifecycle data parts.
- `app/api/chat/reset/route.ts` — reset timestamp.
- `app/page.tsx` — Reset button, language toggle, loading/error states.
- `lib/api.ts` — data-part parsing.

## 4. Acceptance

- [x] Prompt forbids “现在去调用” without a tool call.
- [x] Reset Chat clears the local view and excludes older history (verified locally).
- [x] `中/EN` toggle changes input language hints and persists.
- [x] `push_to_dev` streaming/loading states are wired.
- [ ] Phone PWA loop/reset check.

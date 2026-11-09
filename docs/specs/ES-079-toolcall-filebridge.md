# ES-079 — Fix Tool-Call Parsing & Local File Bridge for AI-PM

- **Status:** Done (2026-11-09). **Tracking:** P2-60. Refs: ES-078, ES-083.
- **Numbering:** the Local RAG skeleton task moved from ES-079 to **ES-083**.

## 1. Textual `<tool_call>` output

- Server sanitizer (`stripToolMarkers`) now removes whole
  `<tool_call>…</tool_call>`, `<tool_calls>…</tool_calls>`,
  `<function_call>…</function_call>` and `<|tool_call|>…</|tool_call|>` blocks,
  in addition to the DeepSeek DSML markers.
- New `lib/textual-tool-call.ts` parses textual calls (tagged blocks, piped
  variants, fenced JSON, arrays) into `{name,args}`.
- `/api/chat` executes up to two textual calls **only if the tool is in the
  active fenshen whitelist**, then asks the model for a short summary of the
  real result. Unknown tools produce an explicit "not permitted" note.
- Client (`lib/api.ts`) strips the same blocks before rendering, so nothing
  leaks even while streaming.

## 2. Local file bridge

- Paths are relative only: `mailbox/`, `local_kb/docs/`, `docs/pm/`. Absolute
  paths (`/Users/...`, `C:\`) are rejected in code with a relative-path hint.
- A missing `local_kb/docs/...` file returns the exact fallback sentence:
  「我无法直接读取你电脑上的文件，请把文件拖进对话框，或者把内容粘贴给我。」
- **Composer attachment**: drag-and-drop **anywhere in the app** (global overlay)
  or the ＋ button reads `.md/.txt/.json` (≤2MB, first 60k chars) and prepends the
  text to the message. `core/system-manifest.md` updated.
- `read_local_file` returns the **body** with `offset`/`limit` paging
  (default 60k, max 60k, `next_offset` when truncated) — it previously returned
  only path/length, then only 12k. BWP_PRD_V3 (42,342 B) is read in full.

## 3. Evidence

```
$ node --test lib/textual-tool-call.test.ts
pass 4
$ npm test
pass 48
```

Real read: `local_kb/docs/BWP_PRD_V3.md` (42,342 bytes) →
the PM reported `Business Work Pad v3.0 / 2026-06-23 / Reviewed & Revised`,
the product goal and the main sections, with no `<tool_call>` or DSML text.
Full read: 37,942 characters, `next_offset` null, last chapters 16–18
(Pricing / Development Phases / Open Questions).

## 4. Notes

- The owner asked for File System Access API or a `localhost:3001` bridge; the
  existing Next server already reads `local_kb` on the Mac (the bridge), and the
  attachment path covers the cloud case without a second process. No new service
  was introduced (YAGNI).
- UI attachment needs a quick on-device confirmation (cannot click in CI).

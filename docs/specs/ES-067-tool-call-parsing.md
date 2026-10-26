# ES-067 — Fix DeepSeek Tool Call Parsing & Force Tool Choice

- **Status:** Urgent Bug (P0). **Tracking:** P2-45. Refs: #83, ES-046, #81.
- **Symptom:** after the owner confirms a write, the model replies "现在写" for
  several turns without calling `write_markdown`; one turn leaked DeepSeek's
  native markup `<｜｜DSML｜｜ calls>` into the chat as text.

## 1. Causes

| Cause | Evidence |
|---|---|
| Prose treated as execution | The model says "现在写" but no `tool_call` is emitted; `/api/chat` returns 200. |
| Tool-call markup leaked as text | `<｜｜DSML｜｜ calls>` in the assistant content — DeepSeek's native syntax, not OpenAI-style `tool_calls`, and nothing filtered it. |
| `read_markdown` returned no body | The silent summarizer dropped `content`, so the model could not base a write on the current file (#81) — it hesitated and narrated instead. |

## 2. Fixes

1. **Never trust prose for a write.** When the owner has confirmed (a `.md` path in
   the message, or a short confirmation after a draft that mentions a `.md`
   file), `streamText` is called with
   `toolChoice: { type: 'tool', toolName: 'write_markdown' }`.
2. **Forced retry.** If the turn ends without a write result, one `generateText`
   runs with the same tools and the forced choice, so a prose-only turn cannot
   end the exchange.
3. **Deterministic reply.** If `write_markdown` succeeded, the persisted reply is
   generated from the tool result (`写好了：<path>（新建/更新，commit …）`), not from
   the model's prose.
4. **Marker sanitizer.** `stripToolMarkers()` removes `<｜｜DSML｜｜ …>`,
   `<|DSML| …>` and dangling `｜｜DSML` lines on the server before persistence, and
   the client strips again before rendering. A reply that becomes empty after
   stripping is surfaced as an error rather than blank text.
5. **Read before write.** `read_markdown` now returns the file body (12k chars,
   per-tool cap 16k), so the model can edit instead of overwrite (#81).
6. **Prompt rule.** "If you decide to call a tool, emit the call immediately;
   never say 我现在去写 without a tool call."

## 3. Acceptance

- [x] Forced tool choice executes on confirmation: a request to write
      `tmp/not-allowed.md` produced a real `write_markdown` call and the
      deterministic reply `没写成：Path not allowed…` (production, 2026-10-26).
- [x] No `<｜｜DSML｜｜…>` text reaches the chat: the same production response
      contained zero markers; unit tests cover opening and closing tags.
- [x] `read_markdown` returns the body: production reply quoted the first two
      lines of `core/habits.md`; the wrapped `{ data: string, meta }` shape is
      covered by a test.
- [ ] A real allowlisted write (owner-confirmed) lands as a Git commit — path is
      covered by `lib/write-markdown.test.ts`; owner to confirm one real write.

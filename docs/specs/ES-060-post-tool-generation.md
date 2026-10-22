# ES-060 — Fix Post-Tool Generation Failure (Agent Loop)

- **Status:** Urgent Bug (P0). **Tracking:** P2-36.
- **Symptom:** after a successful tool call, 元婴 sometimes answers
  "我拿到了结果，但这次没组织好回复。再问我一次？" — the tool ran, the final
  generation produced nothing.

## 1. Causes considered

| Cause | Verdict |
|---|---|
| Tool payload too large for the second generation | **Real risk.** Verbose readback capped at 800 chars, but silent summaries (search results, issue bodies, Drive previews) were unbounded. |
| Second generation timing out (Vercel 60 s) | Possible; the stream error was swallowed and never recorded. |
| Empty stream from DeepSeek | Possible; the empty branch produced the apology string. |

## 2. Fixes

1. **Hard cap on every tool result** (`lib/tool-result.ts`): anything handed to
   the model is capped at **1000 characters** (`HARD_CAP_CHARS`), in both silent
   and verbose modes, with an explicit `note` so the model knows it did not see
   everything.
2. **One automatic retry** (`app/api/chat/route.ts`): if the tool turn ends with
   no text and no `push_to_dev` result, call `generateText` once more with the
   same context and a compact instruction ("answer in ≤3 sentences, no tools,
   maxTokens 400").
3. **Honest fallback**: if the retry also returns nothing, the reply names the
   real error (`empty output`, `retry failed`, stream error) and suggests
   `get_system_status`; the vague apology is gone.
4. **Every chat turn is recorded** in `system_events`
   (`route`, `status`, `duration_ms`, `error`, `meta.empty_reply/retried`),
   which is what `get_system_status` reads (ES-061).

## 3. Acceptance

- [ ] A tool returning ~5000 characters is summarized, not rejected.
- [ ] An empty final generation is retried once before any fallback text.
- [ ] The fallback text contains the actual error, never "没组织好".
- [ ] `system_events` has a row for every chat request (200 and 5xx).

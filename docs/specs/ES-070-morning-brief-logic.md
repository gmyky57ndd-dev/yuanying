# ES-070 — Fix Morning Briefing Logic & Break the Agent Loop

- **Status:** Urgent Bug (P0). **Tracking:** P2-49. Refs: ES-065, ES-071, #84.
- **Symptom:** the first morning message summarised **today** (zeros) and ended with
  "要我存下来吗？"; when the owner objected, the model repeated the same question.

## 1. Causes

| Cause | Detail |
| --- | --- |
| Morning prompt inherited the summary rules | `MORNING_PLAN_RULES` did not exist; the cron reused `SUMMARY_TONE_RULES`, whose last line asks " Shall I save this? 要我存下来吗？" |
| No date guard | `get_summary()` requires a date; the model could pass today at 07:00 and get an empty day. |
| Zeros read as failure | nothing told the model that 0 means "no data / rest / sick". |
| Loop | the save question is *designed* into the summary rules, so every turn ended with it and nothing forced a stop. |

## 2. Fixes

1. **`MORNING_PLAN_RULES`** (`lib/summary-generator.ts`): morning = plan, yesterday
   is the only data, zeros are not failure, never ask to save, no lists.
   The cron now uses these rules instead of the summary rules.
2. **Server-side date guard** (`get_summary`): before 11:00 local, a request for
   today (or with no date) returns **yesterday** with a `note` explaining the
   substitution. The tool schema makes `date` optional.
3. **Prompt/manifest**: zeros mean "no data / rest / not synced"; an empty
   yesterday is "昨天是个空白日"; no "要我存下来吗" before noon; no judgement.
4. **Loop breaker** (`lib/loop-guard.ts`): if the last three assistant turns
   contain the save question twice, the system prompt gets a hard interrupt
   ("stop asking; execute or end"), and a repeated question is stripped from the
   reply before it is persisted or streamed.
5. The cron already reads yesterday explicitly and is idempotent per day.

## 3. Acceptance

- [x] Morning brief uses the plan rules: production dry run returned a concrete plan with no save question.
- [x] `get_summary()` before 11:00 returns yesterday: production chat "看一下今天的简报" returned yesterday's events and today's next step, no save question.
- [x] Empty data produces "昨天是个空白日", not "你没有做事" (prompt + manifest rules).
- [x] Two consecutive save questions cannot repeat a third time (prompt interrupt + reply strip; unit tests).

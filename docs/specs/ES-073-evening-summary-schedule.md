# ES-073 — Evening Summary: Scheduling Reality & End-to-End DoD

- **Status:** Bug fix (#86, #87). **Tracking:** P2-50. Refs: ES-065, ES-070.
- **Symptom:** the 21:30 evening summary did not appear; the messages that did
  appear summarised an empty "today" ("今天没有留下任何笔记…数字停在零").

## 1. Evidence (2026-10-27)

- GitHub Actions `daily-summary.yml` is scheduled for `30 1 * * *` (01:30 UTC =
  21:30 EDT), but its runs were created at **06:19–06:28 UTC** — roughly five
  hours late. GitHub's free scheduler queues jobs; the exact minute is not a
  guarantee.
- The endpoint used `getDateInTimezone()` at execution time, which at 02:26 EDT
  is the **new** day, so it summarised a day with no data.
- The message text therefore said "今天…" and reported zeros.

## 2. Fixes

1. **Target date from the local clock, not the cron.** If the endpoint runs
   before 12:00 local it closes out **yesterday**; otherwise today. `?date=`
   overrides for manual backfills.
2. **Label follows the date**: the prompt says "写昨天（2026-10-26）的总结" and the
   text opens with 昨天, never "今天".
3. **Zeros are not a judgement**: the prompt repeats that all-zero data means
   "no records / rest", not "you did nothing" (mirrors ES-070).
4. **DoD in CI**: `daily-summary.yml` now parses the response and exits non-zero
   unless `{ok: true, message_id}` is present — a silent no-op becomes a red run.

## 3. Historical correction

The wrongly-timed rows are preserved but marked (AGENTS §3):
- id **773** (date 2026-10-26, generated at 02:28 EDT) → `metadata.superseded_by = 826`;
- id **821** (date 2026-10-27, the empty "today") → `metadata.misdated = true`;
- id **826** is the corrected 2026-10-26 summary.
Nothing was deleted; the correction is visible in the metadata.

## 4. Acceptance

- [x] A run at 07:42 EDT targets yesterday (dry-run verified).
- [x] `?force=1` produced message **826** for 2026-10-26 with yesterday's real content (Apple ASO, YouTube uploads); the previous rows are marked superseded/misdated.
- [x] The workflow fails when the endpoint returns no message.

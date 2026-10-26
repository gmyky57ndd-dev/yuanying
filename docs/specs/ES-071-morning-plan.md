# ES-071 — Morning Plan vs Daily Summary

- **Status:** Bug fix (#79). **Tracking:** P2-43.
- **Symptom:** on an empty morning the greeting summarised "today" (0 steps, no
  notes), which reads like a broken summary.

## Fix

Before 11:00 local, when today's signal set is empty, the runtime prompt adds a
directive: do **not** write a "today…" summary; use yesterday's/last completed
summary to give a 2–3 sentence plan (what moved yesterday, what to continue),
no lists, no zeros.

## Responsibilities: evening closes, morning opens (#84)

| Slot | Purpose | Data | Output |
| --- | --- | --- | --- |
| **Evening** (21:30, ES-065) | Close the day | today's notes / signals / conversations | 2–3 sentence reflection, notes first, numbers as background, asks whether to keep it |
| **Morning** (09:00, `POST /api/cron/morning-brief`) | Open the day | **yesterday's** notes + conversations | 1–3 concrete things to continue today; a plan, never a summary |

The morning brief is its own message (`metadata.type = 'morning_brief'`), pushed
to active devices and idempotent per product day. It must not be empty: if the
model returns nothing, a specific prompt-shaped fallback is stored instead.

## Acceptance

- [ ] Empty morning → plan-shaped reply referencing yesterday, not a summary.
- [ ] Once data exists (or after 11:00), normal summaries still work.
- [x] The 09:00 morning brief contains concrete items from yesterday: production dry run named the App Store page, the PSD, v100 and the next step (verified 2026-10-26).
- [x] An empty generation stores a specific fallback instead of a blank message (chat + cron paths).

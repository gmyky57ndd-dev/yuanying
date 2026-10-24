# ES-067 — Morning Plan vs Daily Summary

- **Status:** Bug fix (#79). **Tracking:** P2-43.
- **Symptom:** on an empty morning the greeting summarised "today" (0 steps, no
  notes), which reads like a broken summary.

## Fix

Before 11:00 local, when today's signal set is empty, the runtime prompt adds a
directive: do **not** write a "today…" summary; use yesterday's/last completed
summary to give a 2–3 sentence plan (what moved yesterday, what to continue),
no lists, no zeros.

## Acceptance

- [ ] Empty morning → plan-shaped reply referencing yesterday, not a summary.
- [ ] Once data exists (or after 11:00), normal summaries still work.

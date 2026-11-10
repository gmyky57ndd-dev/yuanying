# ES-084 — P0: Data Integrity & Feedback Loop UX

- **Status:** In Progress (owner device verification pending). **Tracking:** P2-59.
- **Refs:** #8, ES-079 (previous data work), ES-082.

## 1. Data integrity

### 1.1 Steps double counting (#8, 8371 vs 3000)

- Root cause: Health Connect returns per-origin records; summing (or even
  `max_per_origin`) can double-count when one origin holds overlapping
  intervals (phone + watch merged under Fit).
- Fix: `StepsCollector` now calls Health Connect's own
  `aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL)))`, which
  de-duplicates intervals across origins. Per-origin sums are still read and
  stored for audit (`sources`, `raw_value`, `max_per_origin`), and the
  aggregation mode is reported (`healthconnect_count_total`).
- `max_per_origin` remains the fallback if the aggregate call fails.
- Collector version bumped to **v1.0.45** (the earlier DoD references were
  stale at 39; the phone was on 44).

### 1.2 Water count

- `/api/signal` accepts `source=reminder` and `/api/reminder/act` backfills the
  habit signal with `source: 'reminder'` (2-minute dedupe), so a lost client
  POST no longer loses the count. Verified with a temporary water reminder in
  #88's follow-up.

### 1.3 Disclaimer (red line)

- Chat prompt: when the steps context has `partial: true`,
  `sources_count > 1`, or `aggregation = max_per_origin`, the model is told to
  append **「（当前步数数据可能存在偏差）」**.
- Morning/evening summary rules carry the same instruction.

## 2. Feedback loop UX

- Removed the third peer action **Copy as Text** from the note feedback row
  (the message menu still has Copy).
- **Save to Inbox** is now the primary style and shows a toast
  「已存入本地收件箱」 on success; Push shows 「已推送到 GitHub」.
- Per-item `New` badges are suppressed for the default status (only Inbox /
  Pushed / Resolved render), so a list of pending notes no longer repeats
  "New" three times.

## 3. Acceptance

- [ ] On-device: steps produce one deduplicated total (Health Connect
      aggregate), no summed-origin rows (owner to confirm after v1.0.45).
- [x] Feedback UI has one primary action plus Inbox; no `Copy as Text` on the
      note row; success toasts are wired.
- [x] Water reminder writes `source=reminder` (verified earlier).

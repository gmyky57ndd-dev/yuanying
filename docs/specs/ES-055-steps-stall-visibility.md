# ES-055 — Steps Stall Visibility & Language Toggle Removal

- **Status:** Urgent Bug (P0) — owner escalated after three reports.
- **Reported:** 2026-10-21 (owner): steps stopped at 777 (16:40) while the
  collector heartbeat stayed green; the 中/EN button only changed a placeholder.
- **Rule:** stop explaining, fix the observability gap and remove the fake control.

## 1. What was actually true (evidence)

| Fact | Evidence |
|---|---|
| The collector stayed online | `collector_last_report_at` advanced every worker run |
| No steps rows at all after 20:40Z | `signals` query: rows only at 19:07 (522), 20:28 (0, ghost device), 20:40 (777) |
| The UI showed a stale value with no timestamp | `/api/steps` returned `updated_at`, the client never rendered it |

The collector could **fail silently**: no permission, zero HealthConnect records,
or an exception all produced "no POST" and no heartbeat fields, so the PWA could
not distinguish a stale read from a dead pipeline.

## 2. Fixes

1. **Pagination (real bug).** `StepsCollector` read a single page of
   `ReadRecordsRequest`; days with more than the default page size were
   truncated. It now follows `pageToken` (max 10 pages) and reports
   `records_count`.
2. **Outcome reporting.** `CollectorWorker` always writes
   `collector_steps_status` (`ok` | `no_records` | `no_permission` |
   `post_failed` | `error` | `unsupported`), `collector_steps_at`,
   `collector_steps_value`, `collector_steps_records`, and a 140-char
   `collector_steps_error`.
3. **Visibility.** Settings shows `步数同步 · <time> · <status> · <value>`;
   the home steps line shows `最后同步 HH:MM` and turns amber older than 20
   minutes. `/api/steps` now returns `last_sync_at`; `/api/collector/status`
   returns the new fields.
4. **Language toggle removed.** The PWA cannot switch the OS keyboard, so the
   button was false affordance. Input stays `lang="zh-CN"`, autocorrect off,
   spellcheck off; the owner switches languages with the keyboard's own key.
   Documented in `core/system-manifest.md`.

## 3. Frequency (explicit)

| Path | Cadence |
|---|---|
| `SyncCheckWorker` steps upload | every 15 min (WorkManager minimum) |
| `SyncStreamService` refresh | on demand, ~1–2 s after a request (v1.0.34+) |
| `CollectorWorker` | hourly app-usage batch + steps + reminders |

The home label always states the last sync time, so "the system is alive but
HealthConnect returned nothing" is visible instead of inferred.

## 4. Acceptance

- [ ] A run with no permission shows `steps_status=no_permission` in Settings.
- [ ] The steps line shows `最后同步` and turns amber after 20 minutes.
- [ ] No 中/EN button exists; the manifest explains why.
- [ ] `records_count` appears in the heartbeat payload.
- [ ] Owner confirms steps advance without pressing anything.

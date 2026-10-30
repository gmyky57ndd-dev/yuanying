# ES-075 — Evening Summary Pipeline + Delivery Log (3 chains, isolated)

- **Status:** Urgent Bug (P0). **Tracking:** P2-52. Refs: #84, ES-065, ES-073,
  HARNESS-RULES §1 (isolate the chains), §2 (idempotency, no silent failure), §3 (DoD evidence).
- **Numbering note:** the two `ES-0xx` specs in the intake request are already
  implemented — morning briefing = **ES-070**, `add_note` = **ES-071**. This
  document covers only the third, new one.

## 0. Three independent chains (never mix them again)

| Chain | Owner | Trigger | Evidence source |
| --- | --- | --- | --- |
| **A. Evening summary** | server | GitHub Actions cron → `POST /api/cron/evening-summary` | `messages` row + `system_events` 200 |
| **B. 21:30 wind-down reminder** | Android collector | local WorkManager, no server API | `reminder_deliveries` row |
| **C. One-shot scheduler** | server (`scheduler` tool) → reminder poller | a single manual request | `reminders` row |

## A. Evening summary

1. Route `POST /api/cron/evening-summary` (bearer `CRON_SECRET`).
2. **Local-time guard**: runs only between 21:00 and 22:00 in `config.timezone`
   (`?force=1` bypasses; `?at=<ISO>` overrides the clock for testing).
3. **Target date** from the local clock: before noon → yesterday, otherwise
   today (a late cron still closes the right day, ES-073).
4. Input: the day's notes, messages and signals via `generateSummary`.
5. Output: one `messages` row (`role=assistant`,
   `metadata.type='evening_summary'`, `metadata.date=<target>`) + Web Push.
6. Prompt: notes first, numbers as background; **must not ask "要不要总结"** —
   the evening text is a finished summary.
7. **Idempotent**: an existing `evening_summary`/legacy `daily_summary` row for
   the date returns `{ok:true, skipped:'already_generated'}`.
8. Trigger: `.github/workflows/daily-summary.yml` runs at **01:35 and 02:35 UTC**
   (covers EDT/EST); the endpoint skips the run that is not 21:xx local, so a
   delayed GitHub job still lands on the right evening.

## B. `reminder_deliveries`

Migration 028:

```sql
create table reminder_deliveries (
  id bigserial primary key,
  habit text not null,
  scheduled_at timestamptz not null,
  fired_at timestamptz,
  status text not null check (status in ('delivered','failed')),
  error_message text,
  device_id text,
  created_at timestamptz not null default now()
);
```

- Collector writes a `delivered` row immediately after the notification is
  posted, and a `failed` row (with the exception message) when posting throws.
- **Reconciliation**: on each worker run, a fixed-time habit whose slot passed
  by more than 15 minutes without a delivery row is logged once as
  `failed / "missed: process not running"` — a killed process becomes visible.
- `GET /api/reminder/delivery?date=YYYY-MM-DD` returns the day's rows for the DoD
  evidence.

## C. Definition of Done (evidence required)

1. 21:35 run → `system_events` 200 + one new assistant message.
2. Same-day repeat → 200, no new row.
3. Empty day → a short summary from signals, never empty, never a question.
4. Collector reminder → `delivered` row.
5. Kill the process, restart → `failed` row with a reason.
6. Switch `config.timezone` (America/New_York / Asia/Shanghai) → the guard fires
   at the matching local hour, no offset miss.

Evidence is recorded in the tracking item and the issue comment; the item cannot
be marked Done without it (HARNESS-RULES §3).

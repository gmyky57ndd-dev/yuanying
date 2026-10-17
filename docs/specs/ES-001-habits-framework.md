# ES-001 — Habits Framework (Configurable Tracking and Reminders)

**Status:** Approved (owner, 2026-10-15) — approval answers in §8 resolved  
**Category:** Feature  
**Tracking:** P1-12 (confirmed; self-upgrade review moved to P1-15)  
**Depends on:** B-16, P1-09, and **ES-004 (API authentication)** — v1 must not introduce new public write endpoints until ES-004 lands.

---

## 1. Goal

Replace habit-specific reminder configuration with owner-configurable habit definitions. The owner can add or edit supported habits without a code change or app release. Configuration changes should reach the collector within one hour, subject to its hourly WorkManager schedule and connectivity.

This is a configuration capability for the current single-owner product. It does not introduce accounts or multi-user support.

**Out of scope:** streaks, calendars, statistics dashboards, multi-user support, broad Stelio parity, and new reminder delivery platforms.

## 2. Current implementation and constraints

The repository already has a reserved `habits` table, but it lacks the proposed `display_name`, `updated_at`, and reminder fields. Reminder generation and delivery currently run in the Android collector (P1-09); the PWA poller is a foreground fallback. Reminder rows and the `reminder/create` endpoint currently allow only `water`, `standup`, and `vitamin`.

The schema also constrains accepted signal names. Supporting arbitrary habit names as signal names would require a deliberate schema/API change. This spec must not assume that adding a database row alone makes a new signal or reminder operational.

**v1 scope (owner, 2026-10-15):** v1 supports **passive** new habits only (e.g., `steps`). Creating habits manually and presenting dynamic home-screen buttons are deferred to **v1.1**. v1 habit administration is **read-only** in the PWA.

## 3. Data model

Extend the existing table through a forward migration; do not create a parallel table or drop existing data. Proposed fields:

- `display_name`: required user-facing label.
- `updated_at`: required update timestamp.
- `reminder`: nullable, validated reminder-rule JSON (see below).
- `capture_config`: validated capture method/configuration, reusing the existing column where possible.
- `target`: nullable, typed goal configuration.
- `active`: soft-deactivation state.

Keep stable machine identity separate from the editable display label. The habit `name` is immutable after creation. Supported `type` values are `count`, `boolean`, and `duration`; define the validation and value shape for each before implementation.

Seed or migrate the existing water, standup, and vitamin behaviors so they continue to work. Seeding must be idempotent and must preserve owner-modified settings on subsequent deploys.

### Proposed reminder-rule shape

Use validated structured data, not an arbitrary expression string:

```json
{
  "mode": "fixed",
  "times": ["10:30", "15:30", "20:00"],
  "days": "daily"
}
```

```json
{
  "mode": "interval",
  "interval_min": 90,
  "window": { "start": "09:00", "end": "18:00" },
  "days": "weekdays",
  "condition": { "kind": "idle", "minutes": 50 }
}
```

**Per-habit content overrides (owner Q4):** the `reminder` object may include `text_override` and `voice_override` (each `string | null`). The owner defines `display_name`. When an override is `null`, the **authored template** is used; overrides are permitted only for **seeded** habits in v1 (new habits use authored templates).

```json
{
  "mode": "interval",
  "interval_min": 60,
  "window": { "start": "09:00", "end": "22:00" },
  "days": "daily",
  "condition": { "kind": "always" },
  "text_override": null,
  "voice_override": "该喝水了。"
}
```

Supported conditions for v1 should be an explicit allowlist, such as `always`, `count_below_target`, and `idle`. Do not evaluate configuration as code. All reminder evaluation uses the configured product timezone (`config.timezone`) and the shared timezone utilities.

**Timezone writer (owner D5):** designate a single writer for `config.timezone`:
- the **collector** writes it on each hourly run (primary), from the device timezone; and
- the **PWA** writes it only when its device timezone differs by more than 1 hour (exception).

Add a **quiet window `22:00–07:00`** (in `config.timezone`) — reminders are suppressed during the quiet window and are **not backfilled** (missed = missed).

### 3.1 Scheduling semantics (resolved 2026-10-15)

The collector runs hourly and cannot guarantee exact-minute firing or precise sub-hour intervals.

- **Tick check (Plan A):** on each collector tick, a reminder is due when `now - last_fired_at >= interval_min` (for `interval` mode) or when `now` is within the configured window and today's `times` bucket applies (for `fixed` mode), evaluated in the product timezone.
- **No backfill:** missed windows are **not** replayed. A rule fires at most once per its due evaluation on the next tick.
- **Dedup window:** suppress a repeat if `now - last_fired_at < interval_min / 2`.
- **Persistence:** `last_fired_at` is persisted per habit so a restart does not duplicate reminders.
- **Manual logging is independent of reminders:** owner-logged signals (e.g., water taps) never affect whether a reminder fires, and vice versa; only explicit `count_below_target`/`idle` conditions read signal state if configured.

## 4. API and access

**v1 (read-only):**

- `GET /api/habits`: return active habit configuration.

**Deferred to v1.1 (and gated on ES-004):**

- `POST /api/habits` — create (manual habits).
- `PATCH /api/habits/:id` — update allowed fields (`name` immutable).
- Deactivation via `active=false`.

**Access control (owner Q3):** this is a global, cross-cutting concern. It is tracked as **ES-004 — API authentication** (P0). Until ES-004 lands, ES-001 **must not introduce new public write endpoints**; v1 exposes only the read endpoint above. Do not expose database credentials in the app; the read endpoint follows the existing service-access pattern.

## 5. Collector integration

The Android collector remains the primary reminder generator and delivery path (P1-09). It should fetch the active habit configuration at startup or on its hourly run, cache it for no longer than one hour, and retain a safe last-known configuration if offline. Configuration changes take effect on the next successful fetch.

Evaluate validated rules using the configured timezone and the §3.1 semantics. Persist deduplication state so a restart does not produce duplicate reminders. Record reminder history through the existing reminder API/schema, extending allowed identifiers in a migration where needed. Deliver notification and TTS using `display_name` and the `text_override`/`voice_override`-or-authored content.

A deactivated habit stops producing reminders on the next successful refresh. Fail closed for newly introduced reminders when configuration cannot be fetched or is malformed; surface diagnostics without exposing credentials or personal data.

## 6. PWA integration

v1 adds a **read-only** “管理习惯” view that lists active habits, their type, and their reminder rule. Creating, editing, and deactivating habits is **deferred to v1.1** (and requires ES-004). The home view keeps the existing signal-button behavior for the seeded habits; **passive** habits (e.g., steps) appear in the existing steps/summary surfaces. **Manual new habits and dynamic home buttons → v1.1.**

Do not add a broad analytics or calendar interface in this scope.

## 7. Acceptance criteria

- [ ] Forward migration extends the existing table and preserves existing rows.
- [ ] Idempotent seeding preserves existing owner configuration.
- [ ] `GET /api/habits` returns active configuration; **no new public write endpoints** in v1.
- [ ] Existing water, standup, and vitamin reminders retain agreed behavior.
- [ ] Collector refreshes configuration at least hourly when online and does not duplicate reminders after restart (dedup per §3.1).
- [ ] New/previously-edited (via DB) configuration takes effect within one successful collector refresh.
- [ ] Timezone and day scoping use shared utilities and have explicit boundary coverage.
- [ ] Historical signals/reminders remain queryable after deactivation.
- [ ] Offline, malformed-config, notification-permission, and upgrade behavior are documented and handled.
- [ ] v1 supports passive new habits only; manual habit creation and dynamic home buttons are tracked for v1.1.

## 8. Approval questions — resolved (owner, 2026-10-15)

1. **Habit types / capture methods in v1:** v1 supports **passive** new habits only (e.g., steps). Manual new habits + dynamic home-screen buttons → **v1.1**. (§2, §6 updated.)
2. **Scheduling semantics:** **Plan A** — tick-based `now - last_fired_at >= interval_min`; missed windows are **not** backfilled; dedup window = `interval_min / 2`; manual logging is independent of reminders. (New §3.1.)
3. **Endpoint access control:** global concern → new **ES-004 — API authentication** (P0), recommended shared-secret bearer token. ES-001 v1 introduces **no new public write endpoints** until ES-004 lands.
4. **Notification text/TTS:** hybrid — `display_name` is owner-defined; `text_override`/`voice_override` are optional (`null` → authored template, permitted for seeded habits only). (§3 updated.)
5. **Tracking ID:** confirmed **P1-12** (self-upgrade moved to P1-15).

## 9. Non-goals

Do not add streaks, calendars, statistics, multi-user support, arbitrary condition expressions, hard deletion, editable machine identity, or habit-specific code branches that cannot be represented by validated configuration. Do not add public write endpoints before ES-004.

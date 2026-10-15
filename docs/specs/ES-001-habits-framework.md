# ES-001 — Habits Framework (Configurable Tracking and Reminders)

**Status:** Draft — pending owner approval  
**Category:** Feature  
**Tracking:** Proposed P1-12 — conflicts with current `TRACKING.md` P1-12 (self-upgrade review); tech lead must assign the correct ID.  
**Depends on:** B-16 (In Review; owner timezone verification pending), P1-09 (In Review; collector reminder implementation and device verification pending)

---

## 1. Goal

Replace habit-specific reminder configuration with owner-configurable habit definitions. The owner can add or edit supported habits without a code change or app release. Configuration changes should reach the collector within one hour, subject to its hourly WorkManager schedule and connectivity.

This is a configuration capability for the current single-owner product. It does not introduce accounts or multi-user support.

**Out of scope:** streaks, calendars, statistics dashboards, multi-user support, broad Stelio parity, and new reminder delivery platforms.

## 2. Current implementation and constraints

The repository already has a reserved `habits` table, but it lacks the proposed `display_name`, `updated_at`, and reminder fields. Reminder generation and delivery currently run in the Android collector (P1-09); the PWA poller is a foreground fallback. Reminder rows and the `reminder/create` endpoint currently allow only `water`, `standup`, and `vitamin`.

The schema also constrains accepted signal names. Supporting arbitrary habit names as signal names would require a deliberate schema/API change. This spec must not assume that adding a database row alone makes a new signal or reminder operational.

## 3. Data model

Extend the existing table through a forward migration; do not create a parallel table or drop existing data. Proposed fields:

- `display_name`: required user-facing label.
- `updated_at`: required update timestamp.
- `reminder`: nullable, validated reminder-rule JSON.
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

Supported conditions for v1 should be an explicit allowlist, such as `always`, `count_below_target`, and `idle`. Do not evaluate configuration as code. All reminder evaluation uses the configured product timezone (`config.timezone`, default `Asia/Shanghai`) and the shared timezone utilities.

### Scheduling semantics to settle before approval

The collector runs hourly. It cannot guarantee firing at arbitrary exact minute values or every 90 minutes. Define whether rules are due-window based and may fire on the next collector run, how missed windows are handled, and how deduplication works across process restarts and multiple devices. Preserve the existing reminder windows and behavior for the seeded habits unless the owner approves a product change.

## 4. API and access

Proposed operations:

- `GET /api/habits`: return active habit configuration.
- `POST /api/habits`: create a habit after server-side validation.
- `PATCH /api/habits/:id`: update allowed fields; stable `name` is immutable.
- Deactivation: set `active=false`; do not hard-delete through the ordinary UI.

Before implementation, decide how these endpoints are protected. Existing routes must be treated as potentially internet-reachable; do not assume the deployment URL is private. Validate unique names, supported types, JSON shapes, reminder windows, weekdays, and capture methods server-side. Reject unknown fields where appropriate. The collector fetch should use the existing authenticated/service access pattern or an owner-approved equivalent; do not expose database credentials in the app.

## 5. Collector integration

The Android collector remains the primary reminder generator and delivery path (P1-09). It should fetch the active configuration at startup or on its hourly run, cache it for no longer than one hour, and retain a safe last-known configuration if offline. Configuration changes take effect on the next successful fetch.

Evaluate validated rules using the configured timezone and explicit due windows. Persist deduplication state so a restart does not produce duplicate reminders. Record reminder history through the existing reminder API/schema, extending its allowed identifiers in a migration where needed. Deliver notification and TTS using the configured display label and approved message/voice content.

A disabled/deactivated habit must stop producing reminders on the next successful configuration refresh. Define behavior when configuration cannot be fetched or is malformed; fail closed for newly introduced reminders and surface diagnostics without exposing credentials or personal data.

## 6. PWA integration

Add a “管理习惯” settings view to list, create, edit supported fields, and deactivate habits. The home view shows manual-capture habits as logging controls; passive-capture habits appear in relevant summaries. Keep existing signal-button behavior for the seeded habits unless an approved migration explicitly replaces it.

Do not add a broad analytics or calendar interface in this scope.

## 7. Acceptance criteria

- [ ] Forward migration extends the existing table and preserves existing rows.
- [ ] Idempotent seeding preserves existing owner configuration.
- [ ] Server-side CRUD/activation validation and access control are implemented.
- [ ] Existing water, standup, and vitamin reminders retain agreed behavior.
- [ ] Collector refreshes configuration at least hourly when online and does not duplicate reminders after restart.
- [ ] New/edited/deactivated configuration takes effect within one successful collector refresh.
- [ ] Timezone and day scoping use shared utilities and have explicit boundary coverage.
- [ ] Historical signals/reminders remain queryable after deactivation.
- [ ] Offline, malformed-config, notification-permission, and upgrade behavior are documented and handled.

## 8. Approval questions

1. Which additional habit types and capture methods are supported in v1, beyond preserving current defaults?
2. What are the precise due-window, missed-window, and deduplication rules for an hourly collector?
3. What authentication/access-control mechanism protects habit and reminder configuration endpoints?
4. Are habit-specific notification text and TTS editable, or are they authored templates?
5. Confirm the tracking ID: current P1-12 already refers to self-upgrade review.

## 9. Non-goals

Do not add streaks, calendars, statistics, multi-user support, arbitrary condition expressions, hard deletion, editable machine identity, or habit-specific code branches that cannot be represented by validated configuration.

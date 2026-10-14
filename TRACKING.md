# 元婴 — Feature & Bug Tracking Log

**Purpose**: Single source of truth for what's done, in progress, and to do.
**Update cadence**: Daily at 18:00 (required), plus on any state change.
**Owner**: Tech lead (final authority on state), agents and devs (update their own items).

---

## How to Use This File

### Status definitions

| Status | Meaning |
|---|---|
| **To Do** | Not started. Approved by owner. |
| **In Progress** | Actively being worked on. Has an owner. |
| **Blocked** | Cannot proceed. Reason and unblocker recorded. |
| **In Review** | Code complete, awaiting verification by owner or second party. |
| **Done** | Verified working in the environment the user uses. |
| **Backlog** | Captured but not scheduled. No commitment. |
| **Won't Do** | Explicitly rejected. Reason recorded. |

### Entry format

```
## [ID] Short title
* **Status**: ...
* **Owner**: @name or @agent
* **Opened**: YYYY-MM-DD
* **Closed**: YYYY-MM-DD (or —)
* **Phase**: P0 | P1 | P2 | ...
* **Refs**: spec section, PR link, commit hash
* **Description**: What is this? Why does it matter?
* **Acceptance**: How do we know it's done? (bulleted list)
* **Notes**: Diagnostics, decisions, blockers
```

---

## Current Sprint: v2 (P0 + P1)

**Sprint dates**: 2026-03-17 → 2026-03-31
**Sprint goal**: Ship 3-button PWA, 3 voice reminders, and passive step collection.

### Sprint exit criteria

- [ ] PWA has 3 buttons (wake / sleep / water), all functional
- [ ] water reminder fires at 10:30 / 15:30 / 20:00 with TTS
- [ ] standup reminder fires hourly 09:00–18:00 when idle ≥ 50 min
- [ ] vitamin reminder fires at 08:30
- [ ] Android collector reports steps hourly via HealthConnect
- [ ] Owner has used it daily for 7 days without major bugs

---

## In Review

All items below are code-complete and deployed/build-ready. **Owner verification required before Done** (AGENTS.md §6, §7.6).

### [P0-01] Remove `sit` button and signal

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P0
- **Refs**: spec v2 §5; commits `6b8ffac`
- **Description**: Remove `sit` from UI, API, and schema.
- **Acceptance**: UI = wake/sleep/water; `POST /api/signal` rejects `sit`; schema constraint updated; no `sit` literals in code.
- **Notes**: v2 migration applied (`v2_signal_name`, `NOT VALID` to retain historical rows per AGENTS §3.5). `VALID_NAMES=['wake','sleep','water']`; `IDEMPOTENT=['wake','sleep']`; `SIGNALS` = 3 buttons; `sit_count` removed from `/api/summary`. Verification: pending production curl (Check 1) + owner UI check (Check 4).

### [B-15] app_usage `duration_min` inflation `[BUG]`

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P0
- **Refs**: AGENTS §3.3 Example B; work order §4; commits `a71c996` (clamp), `2f3fdf3` (queryEvents)
- **Description**: `queryAndAggregateUsageStats()` returns cumulative totals on OnePlus/ColorOS, producing values like Bilibili 513–653 min in a 60-min window.
- **Reproduction**: `select value->>'name', (value->>'duration_min')::int, created_at from signals where name='app_usage' and value->>'name'='tv.danmaku.bili' order by created_at desc limit 10;` → observed 513–653.
- **Root cause**: ROM-specific cumulative `getTotalTimeInForeground()`.
- **Fix**: Stage 1 (v1.0.5) defensive clamp to window length; Stage 2 (v1.0.6) exact per-window deltas via `UsageEvents.queryEvents()`.
- **Acceptance**: all rows ≤ 60 after 2 hourly batches.
- **Notes**: Historical inflated rows retained as audit trail. Clean-data cutoff = v1.0.6 deploy timestamp (record on deploy).

### [P0-02] Fix silent failure in signal buttons

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P0
- **Refs**: diagnostic report §3 F1; commit `89a8f04`
- **Description**: Buttons gave no feedback. Added optimistic update + visible errors + absolute API URLs. Also root-caused stale service worker (cache-first) → SW v2 network-first.
- **Acceptance**: ≤100ms feedback; failures surface; idempotent; refresh preserves.
- **Notes**: Verified by agent in a clean browser (`water ×2 → ×3`, no console errors). Awaiting owner on-device confirmation.

### [P0-03] Add signal definitions to system prompt

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P0
- **Refs**: diagnostic report §3 F2; commit `89a8f04`
- **Description**: Injected signal definitions + no-fabrication rule.
- **Acceptance**: accurate button answers; "我不知道" on unknown; no fabrication.
- **Notes**: Verified via production `/api/chat` after clearing history.

### [P0-04] Fix 元婴 fabrication of button meanings

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P0
- **Refs**: diagnostic report §3 F2
- **Description**: Fabrication fixed; uncertainty behavior working.
- **Acceptance**:
  - [x] `core/identity.md` includes signal definitions
  - [x] `core/voice.md` includes "不确定时说不确定"
  - [x] `lib/yuanying.ts` injects signal definitions
  - [ ] Owner confirms in production test
- **Notes**: Awaiting owner sign-off. Note: v2 signal set is now 3 buttons; identity/voice sections updated accordingly under P0-01.

### [P1-01] Reminder scheduler

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 App A; commit `810b816`
- **Description**: `lib/reminder-types.ts`, `lib/reminder-scheduler.ts`. Timezone-aware (Asia/Shanghai) because serverless runs UTC.
- **Acceptance**: water < 6; standup idle ≥ 50 min; vitamin once/day; 30-min dedupe.
- **Notes**: Logic unit-reasoned; needs runtime trigger test (P1-02).

### [P1-02] Reminder cron endpoints

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §4.3; work order §6.1; commit `1a32c1f`
- **Description**: `/api/cron/{water,standup,vitamin}` with `CRON_SECRET`; `vercel.json` UTC schedules.
- **Acceptance**: 401 unauth; 200 + `{ok,fired}` with secret; visible in Vercel dashboard.
- **Notes**: `CRON_SECRET` set in Vercel (production + development). Preview not set (crons run in production only).

### [P1-04] `/api/reminder/due` + `/act`

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §4.2; commit `899c8a1`
- **Description**: Returns unshown reminders and marks them shown; records acted/dismissed/snoozed and writes a `reminder_acted` signal.
- **Acceptance**: `/due` only unshown; marks shown; `/act` updates state.

### [P1-03] Client reminder poller + TTS

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 App A.4; commit `09ea769`
- **Description**: `components/ReminderPoller.tsx`, mounted in `app/layout.tsx`. 5-min poll, Chinese TTS + notification, dedupes by id.
- **Acceptance**: mounts; 5-min poll; zh TTS; notification; dedupe.
- **Notes**: Audio/notification require owner device test (iOS Safari TTS limitations per spec Appendix C.2).

### [P1-05] Reminder settings toggles

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §6.4; commit `f4e40e0`
- **Description**: Settings page with per-reminder toggles backed by `config.reminders_enabled`.
- **Acceptance**: toggle persists; disabled reminders do not fire.

### [P1-07] `/api/steps`

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 App B.8; commit `d4111d1`
- **Description**: POST validates + writes `signals(name='steps')`; GET returns today's steps + goal (Beijing day).
- **Acceptance**: rejects malformed; writes; GET returns steps/goal.

### [P1-06] HealthConnect step collection (Android)

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §7, App B; commit `75b243d`
- **Description**: Kotlin `StepsCollector`, hourly report via `CollectorWorker`, permission UI. **New deps**: `androidx.health.connect:connect-client:1.1.0-alpha10`, `com.google.guava:guava:32.1.3-android` (transitive ListenableFuture), Kotlin Gradle plugin `1.9.24`. `minSdk` 24 → 26 (HealthConnect requires 26; spec requires Android 9+).
- **Acceptance**: permission flow on Android 9+; hourly `name='steps'` rows; denied path non-crashing.
- **Notes**: Built into v1.0.7 AAB (minSdk 26). **Requires device verification** — cannot be exercised on CI/host.

### [P1-08] Reference reminders + steps in chat

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §6.3, §7; commit `cc952f3`
- **Description**: `buildSystemPrompt()` now includes steps/goal, water count, last-2h reminders; chat route loads them (Beijing day).
- **Acceptance**: answers "今天走了多少步?" / "我今天喝水够了吗?"; no fabrication when missing.

---

## Blocked

*(empty)*

---

## Done

### [P0-00] Fix PWA not loading after install

- **Status**: Done
- **Closed**: 2026-03-17
- **Notes**: Verified by owner. Later reinforced by SW v2 (network-first).

### [P0-00b] Get Android collector permission working

- **Status**: Done
- **Closed**: 2026-03-17
- **Notes**: Permission granted and status text correct on owner device.

### [F3] Collector data flow verified (audit)

- **Status**: Done
- **Closed**: 2026-10-14
- **Refs**: work order §0
- **Notes**: 11 hourly batches, 161 `app_usage` rows confirmed in Supabase. WorkManager firing as designed.

---

## Backlog

Captured but not scheduled. No commitment. Do not work on these.

- **[B-01]** Passively detect wake / sleep from lock screen (Android `UsageEvents`)
- **[B-02]** iOS passive step collection via HealthKit
- **[B-03]** Desktop companion (menu bar / Tauri)
- **[B-04]** Animated avatar (currently static PNG)
- **[B-05]** Morning / evening briefings
- **[B-06]** Pattern engine (`inferred-patterns.md` → `confirmed-patterns.md`)
- **[B-07]** 元婴 persona customization UI
- **[B-08]** Model router (DeepSeek → Claude → GPT fallback)
- **[B-09]** Voice input via Whisper
- **[B-10]** Weekly digest
- **[B-11]** Stelio full migration (remaining 5 habits)
- **[B-12]** Share sheet integration
- **[B-13]** Voice wake word
- **[B-14]** `activity_logs` pruning / retention policy
- **[B-16]** Play in-app update API (`AppUpdateManager`) to replace the removed GitHub self-updater

### Backlog rules

- Backlog items added by an agent or dev; not removed without owner approval.
- Pulling from backlog is a scheduling decision, not a dev decision.

---

## Won't Do

Explicitly rejected. Reason recorded. Do not re-propose.

### [W-01] Habit tracking UI replicating Stelio
- **Reason**: 元婴 is passive capture + active reminder, not tap-to-log.
- **Closed**: 2026-03-17

### [W-02] `sit` as a tracked signal
- **Reason**: Bad measure, bad interaction. Replaced by steps + standup reminder.
- **Closed**: 2026-03-17

### [W-03] Multi-user / accounts / authentication
- **Reason**: Single-user product for v2.
- **Closed**: 2026-03-17

### [W-04] Analytics / growth metrics / engagement loops
- **Reason**: Violates principle 2.1 (quiet by default).
- **Closed**: 2026-03-17

---

## Changelog

Chronological record of state changes. Newest first.

### 2026-10-14

- Sprint v2 implementation landed (agent): P0-01 sit removal + v2 schema; B-15 duration fix (v1.0.5 clamp, v1.0.6 queryEvents); P1-01..P1-08 reminders + steps.
- P0-01, P0-02, P0-03, P0-04, B-15, P1-01..P1-08 → **In Review**.
- `CRON_SECRET` provisioned (Vercel production + development).
- Collector v1.0.7 AAB built (HealthConnect steps; minSdk 26).
- New dependencies logged: kotlin-gradle-plugin 1.9.24, androidx.health.connect connect-client 1.1.0-alpha10, guava 32.1.3-android.
- **Pending**: owner device verification of P0/P1, and production checks 1–4 for P0-01.

### 2026-03-17
- Sprint v2 opened. P0-00, P0-00b closed. P0-04 In Review. `sit` removed from scope (W-02).

### 2026-03-16
- v1.1 PRD and v2 engineering spec written. Diagnostic report filed (F1/F2/F3).

---

## Metrics We Track (Lightly)

| Metric | Current | Target | Notes |
|---|---|---|---|
| Days owner opened PWA (last 7) | — | 5+ | Presence signal |
| Signals logged (last 7 days) | — | 15+ | Interaction signal |
| Reminders acted on | — | 40%+ | Value signal |
| Reminders dismissed | — | <30% | Friction signal |
| 元婴 "我不知道" instances | >0 | >0 | Honesty signal |

**Not tracked**: session length, DAU/MAU, retention curves, click-through.

---

**End of TRACKING.md**

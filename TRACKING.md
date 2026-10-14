# 元婴 — Feature & Bug Tracking Log

**Purpose**: Single source of truth for what's done, in progress, and to do.
**Owner**: Tech lead (final authority on state); agents update their own items.
**Refs**: `AGENTS.md` v1.3, `docs/Dev Response 1014.md`, `docs/APPENDIX for 1014 response.md`.

---

## Status definitions

| Status | Meaning |
|---|---|
| **To Do** | Not started. Approved/scheduled. |
| **In Progress** | Actively being worked on. Has an owner. |
| **Blocked** | Cannot proceed. Reason + unblocker recorded. |
| **In Review** | Code complete; awaiting verification (owner/device/production). |
| **Done** | Verified in the intended environment, evidence recorded. |
| **Backlog** | Captured, unscheduled. No commitment. |
| **Won't Do** | Explicitly rejected. Reason recorded. |

---

## Current Sprint: v2 (P0 + P1, 2026-10-14 revision)

**Revision note**: Reminder architecture changed — generation **and** delivery move into the **Android collector** (P1-09). External cron and Vercel Pro were **rejected**. All daily counts must use `lib/timezone.ts` / `getTodayRange` (AGENTS §6).

### Sprint exit criteria (updated)

- [ ] PWA has 3 buttons (wake / sleep / water), all functional
- [ ] water reminder fires at 10:30 / 15:30 / 20:00 with TTS
- [ ] standup reminder fires hourly 09:00–18:00 when idle ≥ 50 min
- [ ] vitamin reminder fires at 08:30
- [ ] Android collector reports steps hourly via HealthConnect
- [ ] reminders generated + delivered by the collector (no PWA open required)
- [ ] owner has used it daily for 7 days without major bugs

---

## In Progress

### [P1-01] Reminder scheduler

- **Status**: In Progress
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 App A; `docs/Dev Response 1014.md` §3
- **Description**: Scheduler logic retained in TS, but **implementation migrating to Kotlin** in the collector (P1-09). The TS scheduler remains only for the PWA-open fallback.
- **Notes**: Per Dev Response §2.1/§3 — do not treat as Done; the delivery path moves to Android.

### [P1-03] Client reminder poller (PWA-open fallback)

- **Status**: In Progress
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 App A.4; `docs/Dev Response 1014.md` §3
- **Description**: `ReminderPoller` demoted to a **fallback that only runs while the PWA is open**. Primary delivery becomes the collector (P1-09).
- **Notes**: Keep mounted; do not invest further until P1-09 lands.

---

## In Review

### [P0-01] Remove `sit` button and signal

- **Status**: In Review · **Phase** P0 · **Refs** spec v2 §5; commit `6b8ffac`
- **Acceptance**: UI = wake/sleep/water; API rejects `sit`; schema constraint updated; no `sit` literals.
- **Notes**: v2 migration applied; `v2_signal_name` NOT VALID (historical sit row retained, AGENTS §3 historical records). Production check: `sit → 400` verified. Owner UI check pending.

### [B-15] app_usage `duration_min` inflation `[BUG]`

- **Status**: In Review · **Phase** P0 · **Refs** commits `a71c996`, `2f3fdf3`
- **Description**: ROM returns cumulative foreground totals (e.g., 653 min in a 60-min window).
- **Fix**: v1.0.5 clamp + v1.0.6 per-window deltas via `UsageEvents.queryEvents()`.
- **Acceptance**: all rows ≤ 60 after 2 hourly batches. **Clean-data cutoff** = v1.0.6 collector deploy timestamp (record on device deploy).

### [B-16] water count accumulates across days `[BUG]`

- **Status**: In Review · **Phase** P0 · **Refs** AGENTS §6, APPENDIX B; commit `473a005`
- **Description**: Water (and other daily) counts included previous days; server "today" used UTC and the client re-filtered by browser timezone.
- **Fix**: `lib/timezone.ts` (`getTodayRange`/`getDayRange`, `config.timezone`); applied to `/api/signal` (GET+POST idempotency), `/api/chat`, `/api/steps`; removed client `toDateString()`; removed duplicate `/api/summary`.
- **Acceptance**: unit test passes (day range crosses UTC at 16:00); no `setHours(0,0,0,0)`/`toDateString()` in `app|lib`; **owner confirms reset across a real local midnight** (pending).
- **Blocks**: P1-11.

### [P0-02] Signal button silent failure

- **Status**: In Review · **Phase** P0 · **Refs** diagnostic F1; commit `89a8f04`
- **Notes**: Optimistic update + visible errors + absolute URLs; SW v2 network-first. Verified by agent in a clean browser; owner on-device confirmation pending.

### [P0-03] Signal definitions in system prompt

- **Status**: In Review · **Phase** P0 · **Refs** diagnostic F2; commit `89a8f04`
- **Notes**: Definitions + no-fabrication rule; verified via production `/api/chat`.

### [P0-04] 元婴 fabrication of button meanings

- **Status**: In Review · **Phase** P0 · **Refs** diagnostic F2
- **Notes**: Awaiting owner sign-off (behavior confirmed earlier in chat).

### [P1-04] `/api/reminder/due` + `/act`

- **Status**: In Review · **Phase** P1 · **Refs** spec v2 §4.2; commit `899c8a1`
- **Notes**: Verified in production (401/200, `{reminders:[]}`). Will be consumed by the collector in P1-09.

### [P1-05] Reminder settings toggles

- **Status**: In Review · **Phase** P1 · **Refs** spec v2 §6.4; commit `f4e40e0`
- **Notes**: `/settings` renders the 3 toggles backed by `config.reminders_enabled`.

### [P1-06] HealthConnect step collection (Android)

- **Status**: In Review · **Phase** P1 · **Refs** spec v2 §7/App B; commits `75b243d`, `8dbb240`
- **Notes**: v1.0.8 keeps **minSdk 24** via `tools:overrideLibrary` + `SDK_INT>=26` gate (Play blocked the minSdk-26 reduction). Steps work on Android 9+. **Device verification pending.**

### [P1-07] `/api/steps`

- **Status**: In Review · **Phase** P1 · **Refs** spec v2 App B.8; commit `d4111d1`
- **Notes**: POST/GET verified; GET now uses `getTodayRange` (B-16).

### [P1-08] Reference reminders + steps in chat

- **Status**: In Review · **Phase** P1 · **Refs** spec v2 §6.3/§7; commit `cc952f3`
- **Notes**: `buildSystemPrompt` includes steps/water/recent reminders; now day-scoped via B-16.

### [P1-09] Reminder generation + delivery in Android collector

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: `docs/Dev Response 1014.md` §2.1; commit `c7ef80c`
- **Description**: Collector WorkManager job decides due reminders (Beijing windows), records them via `POST /api/reminder/create`, then shows a notification + Chinese TTS. No cron, no PWA-open requirement.
- **Acceptance**:
  - [x] Collector checks water/standup/vitamin windows hourly
  - [x] Notification + TTS fire without the PWA open (code path)
  - [x] Writes `reminders` rows (shown/acted) for the summary
  - [x] Respects `config.reminders_enabled`
  - [ ] Owner confirms on device
- **Notes**: Kotlin; minSdk 24; `POST_NOTIFICATIONS` requested on Android 13+. iOS deferred (P2). Replaces P1-02. **Device verification pending.** Build v1.0.9 (code 10).

### [P1-10] Steps display on PWA home

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: `docs/Dev Response 1014.md` §2.3; commit `832fcc8`
- **Description**: Show today's steps + goal on the PWA home (reads `/api/steps`).
- **Acceptance**:
  - [x] Home shows `steps / goal`
  - [x] Updates after a step report / reload (refresh on load + on foreground)
  - [x] Honors daily scoping (B-16)
- **Notes**: Verified in production — home renders `步数 0 / 5000`. Owner device check pending.

---

## To Do

### [P1-11] Daily summary v1

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: `docs/APPENDIX for 1014 response.md` Appendix A
- **Description**: Aggregate the day's signals + reminders into a `summaries` row (aggregation only). `POST /api/summary/generate`, `GET /api/summary/today`; chat "看今天的简报".
- **Acceptance**:
  - [ ] `summaries` table created
  - [ ] generate endpoint idempotent (upsert)
  - [ ] `today` caches on hit, generates on miss
  - [ ] empty day produces a record
  - [ ] cross-day boundary per user timezone
  - [ ] chat "看今天的简报" works
- **Notes**: Depends on B-16 (landed). Supersedes the deleted `/api/summary`.

### [P1-12] Review & optimize self-upgrade

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: AGENTS §4.4; this session
- **Description**: Dedicated session to review and optimize the two self-upgrade planes end-to-end and make them robust:
  - **PWA**: GitHub Actions → `vercel deploy --prod` (currently works; token is a reused CLI OAuth token — move to a dedicated no-expiration token; add failure alerting).
  - **Collector**: Play auto-update vs. in-app `AppUpdateManager`; ensure the release pipeline (`v*` tag → signed AAB → Play track) is automated.
- **Acceptance**:
  - [ ] Deploy loop verified from a clean state; failures surface
  - [ ] Dedicated `VERCEL_TOKEN` (no expiration) with rotation note
  - [ ] Play upload automated (service account) OR documented manual fallback
  - [ ] A short runbook in `docs/`
- **Notes**: **Dedicated session** — do not fold into other work. **Interim (owner, 2026-10-14):** use web auto-deployment (`deploy.yml`) for the PWA and **manual AAB upload to Google Play** for the collector until this session.

---

## Blocked

*(none)*

---

## Done

### [P0-00] Fix PWA not loading after install
- **Status**: Done · **Closed**: 2026-03-17 · **Notes**: Reinforced by SW v2 (network-first).

### [P0-00b] Android collector permission working
- **Status**: Done · **Closed**: 2026-03-17.

### [F3] Collector data flow verified (audit)
- **Status**: Done · **Closed**: 2026-10-14 · **Notes**: 11 hourly batches, 161+ `app_usage` rows confirmed.

---

## Backlog

Unscheduled. Do not start without owner/tech-lead scheduling.

- **[B-01]** Passive wake/sleep from lock screen · **[B-02]** iOS HealthKit steps · **[B-03]** Desktop companion · **[B-04]** Animated avatar · **[B-05]** Morning/evening briefings · **[B-06]** Pattern engine · **[B-07]** Persona customization UI · **[B-08]** Model router · **[B-09]** Whisper voice input · **[B-10]** Weekly digest · **[B-11]** Stelio full migration · **[B-12]** Share sheet · **[B-13]** Wake word · **[B-14]** `activity_logs` retention · **[B-17]** `summaries` retention/pruning

---

## Won't Do

### [P1-02] Reminder cron endpoints
- **Reason**: Replaced by P1-09 (collector owns generation + delivery). External cron and Vercel Pro explicitly rejected (`docs/Dev Response 1014.md` §2.1, §5).
- **Closed**: 2026-10-14

### [W-01] Habit tracking UI replicating Stelio
### [W-02] `sit` as a tracked signal
### [W-03] Multi-user / accounts / authentication
### [W-04] Analytics / growth metrics / engagement loops

---

## Changelog

### 2026-10-14 (session 2)
- Adopted Dev Response 1014: reminders → Android collector (P1-09); cron (P1-02) → **Won't Do**; P1-01/P1-03 → In Progress.
- **B-16** implemented (daily scoping via `lib/timezone.ts`); In Review pending owner cross-midnight check.
- Created P1-09, P1-10, P1-11, **P1-12 (self-upgrade review — dedicated session)**.
- `AGENTS.md` finalized v1.3.
- Removed duplicate `/api/summary` (replaced by P1-11's `/api/summary/today`).
- **P1-09** implemented (collector generates + delivers reminders); In Review pending device check. Collector build **v1.0.9** (code 10).
- **P1-10** implemented (steps display on PWA home); In Review, production-verified.
- **Self-upgrade interim** (owner, 2026-10-14): web auto-deploy is live; Google Play upload stays **manual** until the P1-12 dedicated session.

### 2026-10-14 (session 1)
- Sprint v2 landed: P0-01 sit removal; B-15 duration fix; P1-01..P1-08.
- Vercel CI deploy loop restored (`.github/workflows/deploy.yml`).
- Collector v1.0.8 (minSdk 24 + HealthConnect).

### 2026-03-17
- Sprint v2 opened.

---

## Metrics We Track (Lightly)

| Metric | Current | Target | Notes |
|---|---|---|---|
| Days owner opened PWA (last 7) | — | 5+ | Presence |
| Signals logged (last 7 days) | — | 15+ | Interaction |
| Reminders acted on | — | 40%+ | Value |
| Reminders dismissed | — | <30% | Friction |
| 元婴 "我不知道" instances | >0 | >0 | Honesty |

---

**End of TRACKING.md**

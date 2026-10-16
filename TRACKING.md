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

## Scheduled reminders

- **2026-10-22** — **[P0-05] ES-004 enforce phase**: set `AUTH_ENFORCE=true` on Vercel (after the 7-day grace) — only once legitimate clients show `would_401=false` in `auth_events`. Runbook: `docs/runbooks/ES-004-enforce.md`.

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

### [P2-01] Opinions file structure + schema

- **Status**: In Review · **Category**: Feature · **Refs**: ES-006 §5; commit `46acf06`
- **Notes**: `core/opinions/{held,confirmed,rejected,archive}.md` created with the entry format (id, Confidence, First observed, Last engaged, Topic, Evidence).

### [P2-02] Detector 1 — avoidance via adjacent tasks

- **Status**: In Review · **Category**: Feature · **Refs**: ES-006 §4; `scripts/opinions.mjs` (`npm run opinions:detect`)
- **Notes**: Runs as an **agent batch** (core/opinions files are read-only on the serverless runtime — writes are committed). Requires 5+ consecutive note-days **and** adjacent activity (false-positive guard); max 3 held (oldest → archive); topic heuristic; off-limits filter. Nightly scheduling is the agent/cron invoking the script.

### [P2-03] Confirmation protocol + file transitions

- **Status**: In Review · **Category**: Feature · **Refs**: ES-006 §7; `npm run opinions:respond <id> 对|不对|有可能 [reason]`
- **Notes**: 对 → `confirmed.md`; 不对 → `rejected.md` (+reason, never re-proposed); 有可能 → confidence +0.1; silence → −0.05/week, 60 days → `archive.md`.

### [P2-04] Prompt integration — confirmed + held opinions

- **Status**: In Review · **Category**: Feature · **Refs**: ES-006 §8; `lib/yuanying.ts`
- **Notes**: `confirmed.md` always; `held.md` only when the conversation topic matches; `rejected.md`/`archive.md` never. Prompt line + "we" voice + priority order (ground rules > opinions; confirm-before-action > all).

### [P2-05] Off-limits filter from ground rules

- **Status**: In Review · **Category**: Feature · **Refs**: ES-006 §10; `lib/opinions.ts` + detector filter
- **Notes**: Reads `## No opinions about` from `core/ground-rules.md`; **hard filter** (not a threshold). Owner populates over time; empty filter acceptable for v1 (non-blocking).

### [B-21] Steps signal diagnostic (value 0 vs summation bug) `[BUG]`

- **Status**: In Review · **Phase**: P0 · **Opened**: 2026-10-16 · **Refs**: ES-007 §3; commit `44dbc35`
- **Diagnostic** (logged per §3): today's snapshots were `723` then `0` — **some value > 0 but summary showed 0 → aggregation bug** (not a total HealthConnect failure).
- **Fix**: summary uses the **max snapshot** of the day (`pickDailySteps`/max). Applied (ES-005 §E.3); see **P1-23**.
- **Source mismatch (escalated, no code change)**: HealthConnect values (0/723) are far below the Fit app (~6k) → likely source/counter-scope mismatch; **reported to owner** for the same-source check ("matches Fit within 10%").
- **Moved** from Backlog to Bug per Work Order §5.2.

### [P1-16] Voice pass — 元婴 speaks, not reports

- **Status**: In Review
- **Category**: Bug (voice violated core/voice.md)
- **Refs**: ES-005 §E.1; commit `c7c4af7`
- **Notes**: `core/voice.md` "When reporting data" section + system-prompt rule. Acceptance: chat to "看今天简报" starts with a sentence; no Signals/Totals/Reminders bullets; numbers inside sentences. **Spot-check 2026-10-15:** reply led with a label ("今天：") — rule is in the prompt but the model still drifts; owner to confirm, may need prompt tightening (no separate task yet).

### [P1-17] Reminder cadence — quiet window, 2h standup, cap 6/day

- **Status**: In Review
- **Category**: Bug (9/day violated quiet-by-default)
- **Refs**: ES-005 §E.2; commit `de6bab5`; collector v1.0.15
- **Notes**: TS scheduler quiet window + daily cap 6 + 60-min miss sweep; collector daily cap 6 (quiet window already); standup habit interval 60→120; `reminders.missed_at` added.

### [P1-18] Weekly digest endpoint

- **Status**: In Review
- **Category**: Feature
- **Refs**: ES-005 §E.4; commit `209ab4e`
- **Notes**: `GET /api/digest/week` + `lib/digest-generator.ts`; prose (not fields); stored in `summaries` with `type='week'`.

### [P1-19] Ground rules file + prompt integration

- **Status**: In Review
- **Category**: Feature
- **Refs**: ES-005 §E.5; commit `c7c4af7`
- **Notes**: `core/ground-rules.md` seeded (owner edits over time, non-blocking). Loader handles present/empty/missing (warn once). Priority-order block in prompt.

### ES-005 §E.3 — Steps diagnostic (recorded)

- **Result**: **aggregation bug** (not a total HealthConnect failure). Today's `steps` snapshots: `723` then `0`; the summary used "last" → showed 0. Fix: max-of-day snapshot (`lib/summary-generator.ts`). Acceptance: today's steps reflect the day's max snapshot; steps line and summary agree.

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

### [B-17] button/summary inconsistency `[BUG]`

- **Status**: In Review · **Phase** P0 · **Refs** `docs/PM/PM Feedback — 2026-10-14.md` §2.4; commit `56a0762`
- **Description**: Signal buttons read live `/api/signal` while the chat summary read a cached `summaries` row that never refreshed → buttons showed `wake` active / `water ×1` but the summary showed `起床: 未记录` / `喝水: 0/6`.
- **Evidence**: `summaries` row `updated_at 2026-10-14T18:38:34Z` (wake null, water 0) while `wake`/`water` signals were written `19:16Z` (same Beijing day).
- **Fix**: `getTodaySummaryCached` now regenerates when the cached row is older than the newest signal/reminder of the day.
- **Acceptance**: summary matches buttons after new signals; owner confirms on device.
- **Blocks**: P1-14.

### [B-18] 元婴 states inference as fact `[BUG]`

- **Status**: In Review · **Phase** P0 · **Refs** `docs/PM/PM Feedback — 2026-10-14.md` §2.5; commit `a184e33`
- **Description**: 元婴 said "…有一串 app_usage。十九次。没睡。" — diagnosing instead of observing (learning loop step 3).
- **Fix**: authored rule in `core/voice.md` (观察，不诊断) + runtime reinforcement in `lib/yuanying.ts` (propose, never conclude).
- **Acceptance**: 元婴 presents inferences as questions, not facts; owner confirms.

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

### [P1-11] Daily summary v1

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: `docs/APPENDIX for 1014 response.md` Appendix A; commit `5a276c4`
- **Description**: Aggregate the day's signals + reminders into a `summaries` row (aggregation only). `POST /api/summary/generate`, `GET /api/summary/today`; chat "看今天的简报".
- **Acceptance**:
  - [x] `summaries` table created
  - [x] generate endpoint idempotent (upsert)
  - [x] `today` caches on hit, generates on miss
  - [x] empty day produces a record
  - [x] cross-day boundary per user timezone
  - [x] chat "看今天的简报" works
- **Notes**: Verified in production (generate → cached `today`; chat returns the formatted brief). Supersedes the deleted `/api/summary`.

### [P1-12] Configurable habits

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: `docs/specs/ES-001-habits-framework.md` (approved 2026-10-15); commit `0675e78`
- **Description**: Configurable habits (minimal). v1 = **passive** new habits only; read-only administration; reminder rules support fixed times + per-day intervals (§3.1 tick semantics); the collector reads server config.
- **Acceptance**:
  - [x] Forward migration + idempotent seed (water/standup/vitamin)
  - [x] `GET /api/habits` read-only; no new public write endpoints (ES-004 gate)
  - [x] Collector evaluates fixed/interval rules with §3.1 semantics (tick, no backfill, dedup)
  - [x] Authored templates + optional `text_override`/`voice_override`
  - [x] Settings read-only 管理习惯 list
  - [ ] Owner device verification (collector v1.0.10)
- **Notes**: Web deployed; collector **v1.0.10** (code 11) pending Play upload + device check. v1.1 (manual habits + dynamic buttons) gated on ES-004.

---

### [P1-21] Summary window — 今天 = last completed day

- **Status**: In Review · **Category**: Bug · **Refs**: ES-007 §1 · **Opened**: 2026-10-16
- **Problem**: home summary + 今天 panel showed the current *incomplete* day (before 18:00 it leaked partial data).
- **Spec**: before 18:00 local → **yesterday** (label 昨天); 18:00–24:00 → **today** (label 今天); after 00:00 → **yesterday**.
- **Impl**: `getDisplayDay(tz)` in `lib/timezone.ts`; `getDisplaySummary()` in `lib/summary-generator.ts` returns `{...summary, label}`; `/api/summary/today` + `/api/chat` use it; panel header renders the label.
- **Verified (2026-10-16, prod)**: `GET /api/summary/today` → `date=2026-10-15, label=昨天` (tz `America/New_York`, before 18:00).
- **Remaining**: owner confirms the label flips at 18:00 on device.

### [P1-23] Steps diagnostic + fix

- **Status**: In Review · **Category**: Bug · **Refs**: ES-007 §3; **P0** ([B-21])
- **Diagnostic (logged per §3, 2026-10-16)**: today's snapshots were `723` then `0`; last-5-day rows all `source=passive` with 0-value rows appearing after real values.
- **Root cause**: a late empty HealthConnect sync wrote `value=0`, and the "latest snapshot" read let it overwrite the real value.
- **Fix**: both `lib/summary-generator.ts` (`pickDailySteps`) and `GET /api/steps` now take the **max snapshot** of the day.
- **Verified (2026-10-16, prod)**: `/api/summary/today` → `steps.value=2809` (max of 723/2809/0), not the trailing 0.
- **Source mismatch (escalated, no code change)**: HealthConnect (0/723) far below the Fit app (~6k) → same-source check reported to owner.

### [P1-24] Action model — unify counters

- **Status**: In Review · **Category**: Feature · **Refs**: ES-007 §4
- **Impl**: `SummaryData` gains `standup {count,target}` and `vitamin {done,at}`; summary + "今天" panel show 喝水 x/6, 起身 x/8, 维生素 ✓ HH:MM; `/api/reminder/act` writes `context.habit` and, for water, a single `water` action (reminder action = manual action). Prompt line updated.
- **Verified (2026-10-16, prod)**: `/api/summary/today` returns `standup:{count,target}` and `vitamin:{done,at}`.

### [P1-25] Reminder notification action buttons

- **Status**: In Review · **Category**: Feature · **Refs**: ES-007 §4
- **Impl**: collector notification now has a habit action (water 喝了 / standup 起身了 / vitamin 吃了) + 忽略; `ReminderActionReceiver` maps acted→`acted`, ignore→`dismissed`; acted opens the app, ignore stays quiet.
- **Verified (2026-10-16)**: Android Collector CI build green (run `38929058636`, debug-APK artifact). Collector bumped to **v1.0.17 (code 18)**, not yet released (owner triggers via "push").
- **Remaining**: device verification (no local JDK); PWA fallback = open modal.

---

## To Do

### [P1-26] Home redesign — activities + chat only
- Status: To Do · Category: Feature · Refs: ES-008 §2.1 · Owner: @dev

### [P1-27] History tab — day list + detail
- Status: To Do · Category: Feature · Refs: ES-008 §2.2 · Owner: @dev

### [P1-28] Note capture — free text, no metadata
- Status: To Do · Category: Feature · Refs: ES-008 §2.3 · Owner: @dev

### [P1-29] Move settings off home
- Status: To Do · Category: Feature · Refs: ES-008 §2.1 · Owner: @dev

### [B-19] Date/reminder windows use fixed Asia/Shanghai, not the phone timezone `[BUG]`

- **Status**: In Review · **Phase**: P0 · **Opened**: 2026-10-15 · **Refs** AGENTS §2.1/§6; commit `bc4aa12`
- **Description**: Date boundaries and reminder windows are computed in a hardcoded `Asia/Shanghai` (collector `ReminderScheduler` TZ constant, `lib/timezone.ts` default, `config.timezone` default). On a phone whose location/timezone is not Beijing, the reminder windows map to the wrong local time and notifications fire during the user's sleeping hours.
- **Observed**: a reminder notification fired during sleeping time.
- **Fix (implemented)**: collector uses the **device timezone** (`TimeZone.getDefault()`) and is the **primary writer** of `config.timezone` (each hourly run); the PWA writes only on a **>1h mismatch** (exception). Added **quiet window 22:00–07:00** (`config.quiet_window`) — reminders suppressed, no backfill (ES-001 §3 / owner D5).
- **Acceptance**:
  - [x] Reminders evaluated in the device timezone
  - [x] No notifications during the quiet window (no backfill)
  - [x] `config.timezone` reflects the device timezone (collector primary)
  - [ ] Owner device verification (collector v1.0.11)
- **Notes**: Not a duplicate of B-16 (B-16 scoped daily counts to a *configured* tz; this makes that tz the device's). Collector **v1.0.11** (code 12) pending Play upload + device check.

### [P1-15] Review & optimize self-upgrade

- **Status**: In Progress
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: AGENTS §4.4/§4.7; `docs/runbooks/self-upgrade.md`
- **Description**: Dedicated session to review and optimize the two self-upgrade planes end-to-end and make them robust:
  - **PWA**: GitHub Actions → `vercel deploy --prod` (currently works; token is a reused CLI OAuth token — move to a dedicated no-expiration token; add failure alerting).
  - **Collector**: Play auto-update vs. in-app `AppUpdateManager`; ensure the release pipeline (`v*` tag → signed AAB → Play track) is automated.
- **Acceptance**:
  - [x] Deploy loop verified from a clean state; failures surface
  - [ ] Dedicated `VERCEL_TOKEN` (no expiration) with rotation note — owner action
  - [x] Play upload automated (service account) OR documented manual fallback — **verified**: v1.0.14 release uploaded to Play internal (draft); workflow gated on `PLAY_SERVICE_ACCOUNT_JSON`
  - [x] A short runbook in `docs/` — `docs/runbooks/self-upgrade.md`
- **Notes**: **Dedicated session** — do not fold into other work. **Scheduled 2026-10-15** (owner: run the manual process one more day). **Interim (owner, 2026-10-14):** use web auto-deployment (`deploy.yml`) for the PWA and **manual AAB upload to Google Play** for the collector until this session. **Observation 2026-10-15:** the Vercel Git integration is auto-deploying on push again (independent of CI); the CI `VERCEL_TOKEN` (reused CLI OAuth) rotated and was refreshed — a dedicated no-expiration token is still required.

---

## Blocked

### [P1-22] Wake detection — brief_wake vs wake

- **Status**: Blocked · **Category**: Bug · **Refs**: ES-007 §2 · **Opened**: 2026-10-16
- **Done**: `brief_wake` added to the signal-name constraint (`v3_signal_name`, migration `010_brief_wake.sql`) and to `/api/signal` accepted names; summaries count only `wake` (brief_wake excluded).
- **Blocker**: §2 requires inferring brief-wake vs wake from an unlock/brief-wake signal and prompting once per night. The app has **no unlock/brief-wake detection source** (no unlock-access permission; HealthConnect does not expose it). Needs an owner decision on the detection source.
- **Unblocker**: approve a detection source (or drop the auto-prompt and keep brief_wake as a manual/collector-only signal).

### [P0-05] API authentication (ES-004)

- **Status**: In Progress · **Phase**: P0 · **Opened**: 2026-10-15
- **Refs**: `docs/specs/ES-004-api-authentication.md` (approved 2026-10-15)
- **Description**: Global API access control. PWA = owner password → **httpOnly session cookie (30 days, refreshed on use)**; collector = bearer token; `/api/cron/*` keeps `CRON_SECRET`.
- **Sub-tasks**:
  - [x] **Logging phase** (§3.1) — live 2026-10-15; `auth_events` populated (`would_401` recorded, `enforced=false`).
  - [ ] **Enforce phase** — set `AUTH_ENFORCE=true` after the grace (target ~2026-10-22), once legitimate clients show `would_401=false`.
  - [x] PWA session cookie (30d, refreshed on use) + collector bearer (baked build-time).
- **Notes**: Priority #2. Grace started **2026-10-15** → enforce on/after **2026-10-22**. `OWNER_PASSWORD`/`API_TOKEN`/`SESSION_SECRET`/`IP_SALT` set in Vercel + `.env.local` (values not recorded here). ES-001 v1.1 write endpoints depend on this.

### [P1-13] Daily notes

- **Status**: In Review · **Phase**: P1 · **Opened**: 2026-10-14 · **Refs** `docs/specs/ES-002-daily-notes.md` (approved 2026-10-15); commit `4527ecc`
- **Description**: "记一笔" text note (voice transcribed at input; text only); notes stored as signals and integrated into the summary.
- **Acceptance**:
  - [x] `note` accepted (migration) + server validation (empty / >2000 rejected)
  - [x] Content never logged
  - [x] PWA 记一笔 editor + count + today's list; mic hidden if unsupported (A1)
  - [x] Summary `notes {count, ≤10 excerpts ≤200}`; prompt labeling block (A2)
  - [ ] Owner device verification
- **Notes**: Verified in production (valid / empty / long; summary includes the note). Deletion UI deferred to **P2-01**.

### [P1-14] Tracking visibility

- **Status**: In Review · **Phase**: P1 · **Opened**: 2026-10-14 · **Refs** `docs/specs/ES-003-tracking-visibility.md` (approved 2026-10-15); commit `4036521`
- **Description**: Home “今天” transparency panel (collapsible): 自动 / 手动 / 提醒, counts only.
- **Acceptance**:
  - [x] Collapsed one-line summary `今天 ▸ 自动 n · 手动 n · 提醒 n` (B1)
  - [x] Rows count only (no app names) (B2)
  - [x] Tap a row → prefilled editable chat; send stays explicit (no auto model call)
  - [x] Reads `/api/summary/today`; refreshes after log/note/chat
  - [ ] Owner device verification
- **Notes**: Added `apps_used` to the summary; cached-summary now regenerates on schema drift. Depends on B-17 (fixed).

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

- **[B-01]** Passive wake/sleep from lock screen · **[B-02]** iOS HealthKit steps · **[B-03]** Desktop companion · **[B-04]** Animated avatar · **[B-05]** Morning/evening briefings · **[B-06]** Pattern engine · **[B-07]** Persona customization UI · **[B-08]** Model router · **[B-09]** Whisper voice input · **[B-10]** Weekly digest · **[B-11]** Stelio full migration · **[B-12]** Share sheet · **[B-13]** Wake word · **[B-14]** `activity_logs` retention · **[B-20]** `summaries` retention/pruning · **[B-22]** Note deletion UI (ES-002; deferred, not v1)

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

### 2026-10-16 (session 9 — Work Order: ES-007 P1-21…P1-25)
- **P1-21** summary window (**In Review**): `getDisplayDay()` + `getDisplaySummary()`; summary/chat/panel reflect the last completed day (18:00 rule).
- **P1-22** wake detection (**Blocked**): `brief_wake` added to schema constraint `v3_signal_name` (migration `010_brief_wake.sql`) + `/api/signal`; auto brief-wake inference blocked (no unlock detection source).
- **P1-23** steps (**In Review**): diagnostic logged (723→0 overwrite); `pickDailySteps` + `GET /api/steps` now take the day's max snapshot.
- **P1-24** action model (**In Review**): `standup`/`vitamin` in summary; 喝水/起身/维生素 counters; reminder action = manual action.
- **P1-25** reminder buttons (**In Review**): collector habit action + 忽略; `ReminderActionReceiver` acted/dismissed; device verify pending.
- AGENTS.md → **v1.5**; docs created: `ES-007`, `ES-008`, `2026-10-16-feedback`.

### 2026-10-15 (session 8 — owner identity revision)
- Owner revised `core/identity.md` (user→owner; signals/notes reframing). Loaded into the prompt; web deploy via push.

### 2026-10-15 (session 7 — collector version record)
- Collector UI now shows a **version + updated-timestamp record** (`v1.0.16 (17) · 更新 <last update>`). Collector **v1.0.16** (code 17).
- Release trigger confirmed **manual**: owner says "push" → web push-deploy + collector tag→Play.

### 2026-10-15 (session 6 — ES-006 learning loop)
- Executed P2-01..P2-05: opinions files, detector 1, confirmation transitions, prompt integration, off-limits filter (all **In Review**).
- Detector + transitions run as an **agent-batch script** (`scripts/opinions.mjs`); `core/opinions/*.md` are read-only on the runtime (writes committed).
- Backlog note-deletion renumbered **P2-01 → B-22** (ID freed for ES-006 §13).

### 2026-10-15 (session 5 — ES-005 option A)
- Executed ES-005 Part C: steps diagnostic (aggregation bug fixed), `summaries.type` migration, reminder cadence (quiet window / 2h standup / cap 6 / miss-60min), weekly digest, voice pass, ground-rules prompt integration.
- New: **P1-16** (voice), **P1-17** (cadence), **P1-18** (digest), **P1-19** (ground rules) → In Review. **B-21** (steps) confirmed+fixed.
- Collector **v1.0.15**.
- **Self-upgrade complete**: web auto-deploy + collector tag → signed AAB → GitHub Release → Play internal (verified).

### 2026-10-15 (session 4 — ES-001 landed; B-19; ES approvals)
- ES-001 v1 landed → P1-12 In Review (migration+seed, `GET /api/habits`, config-driven collector reminders, read-only settings). Collector v1.0.10.
- ES-002/ES-003/ES-004 **approved** with owner amendments; specs updated (ES-002 A1/A2; ES-003 B1/B2; ES-004 C1/C3; ES-001 §3 D5).
- **P0-05 (ES-004) → In Progress** — logging phase first (7-day grace; `auth_events` table), then enforce.
- **B-19 implemented** (device timezone + quiet window) → In Review; collector **v1.0.11** (code 12).
- Backlog: **[P2-01]** Note deletion UI (ES-002, deferred).
- **Priority order:** B-19 → ES-004 logging → ES-002 → ES-003 → ES-004 enforce.
- **ES-004 logging phase implemented** (behind `AUTH_ENFORCE=false`): middleware + `auth_events` + PWA session cookie + collector bearer. Grace started 2026-10-15. Collector **v1.0.12** (code 13).
- **ES-002 implemented** (daily notes): `note` migration, `/api/note`, summary notes + prompt labeling, PWA 记一笔 editor → P1-13 In Review.
- **ES-003 implemented** (tracking visibility): collapsible 今天 panel (counts only) → P1-14 In Review. Added `apps_used` to summary.
- **Self-upgrade (P1-15)**: runbook `docs/runbooks/self-upgrade.md`; Play auto-upload added to `android-release.yml` (gated on `PLAY_SERVICE_ACCOUNT_JSON`); dedicated `VERCEL_TOKEN` pending owner.
- **ES-004 enforce runbook** `docs/runbooks/ES-004-enforce.md`; reminder set for **2026-10-22** (Scheduled reminders).
- **Play auto-upload wired**: `PLAY_SERVICE_ACCOUNT_JSON` secret set; v1.0.13 release published. **Blocked** on owner Cloud step — enable the *Google Play Android Developer API* in project `yuanying-511715` (761958009862) + grant the service account Release permission in Play Console. Then re-run the release.
- **Play auto-upload verified** (owner enabled the API + granted the service account): release v1.0.14 → AAB uploaded to Play **internal** track (draft). Full self-upgrade loop now automated: web (Git integration) + collector (tag → signed AAB → GitHub Release → Play).
- **Docs committed** (external edits by owner/Gemini, recorded here): `AGENTS.md` **v1.4 (draft)** (left as-is per instruction), `AGENTS-v1.3.md` archive, and `docs/specs/ES-001/002/003`. Note: `ES-004`, the runbooks, and the PM feedback still live at the project root `docs/` (outside this repo).

### 2026-10-14 (session 3 — PM handoff)
- Adopted PM Feedback 2026-10-14. Created + fixed **B-17** (button/summary inconsistency) and **B-18** (元婴 states inference as fact) → In Review.
- Created **P1-12** (Configurable habits), **P1-13** (Daily notes), **P1-14** (Tracking visibility) — **Blocked**: the `ES-001/002/003` spec files are **not present** in the repo.
- Renumbered the self-upgrade item **P1-12 → P1-15** to free P1-12 for Configurable habits (PM doc §6).
- Reported the missing spec files and requested them (AGENTS §9).
- **B-19** logged (Bug P0): date/reminder windows hardcode `Asia/Shanghai` instead of the phone timezone → notification fired during sleeping time. Fix: derive tz from phone location/timezone for all activities.
- **ES-001 approved** (owner answered all 5 questions) — spec updated (§2 v1 passive-only, §3 overrides, new §3.1 tick semantics, §6 read-only, §8 resolved). P1-12 → **In Progress**.
- Created **ES-004 (API authentication)** spec + **P0-05** (Blocked pending approval). ES-001 v1 must not add public write endpoints until ES-004 lands.
- P1-13/P1-14 remain Blocked (ES-002/ES-003 still Draft, pending owner answers).
- **ES-001 v1 implemented** (configurable habits: migration+seed, `GET /api/habits`, config-driven collector reminders, read-only settings view) → P1-12 In Review. Collector build **v1.0.10** (code 11).

### 2026-10-14 (session 2)
- Adopted Dev Response 1014: reminders → Android collector (P1-09); cron (P1-02) → **Won't Do**; P1-01/P1-03 → In Progress.
- **B-16** implemented (daily scoping via `lib/timezone.ts`); In Review pending owner cross-midnight check.
- Created P1-09, P1-10, P1-11, **P1-12 (self-upgrade review — dedicated session)**.
- `AGENTS.md` finalized v1.3.
- Removed duplicate `/api/summary` (replaced by P1-11's `/api/summary/today`).
- **P1-09** implemented (collector generates + delivers reminders); In Review pending device check. Collector build **v1.0.9** (code 10).
- **P1-10** implemented (steps display on PWA home); In Review, production-verified.
- **P1-11** implemented (daily summary v1 + chat brief); In Review, production-verified.
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

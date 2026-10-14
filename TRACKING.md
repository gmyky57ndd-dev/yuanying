# TRACKING.md  
```
markdown
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
* **Status**: To Do | In Progress | Blocked | In Review | Done | Backlog | Won't Do  
* **Owner**: @name or @agent  
* **Opened**: YYYY-MM-DD  
* **Closed**: YYYY-MM-DD (or —)  
* **Phase**: P0 | P1 | P2 | ...  
* **Refs**: spec section, PR link, commit hash  
* **Description**: What is this? Why does it matter?  
* **Acceptance**: How do we know it's done? (bulleted list)  
* **Notes**: Diagnostics, decisions, blockers  
```
text
Keep entries short. Long histories go in the changelog at the bottom or in PRs.

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

## In Progress

### [P0-01] Remove `sit` button and signal

- **Status**: In Progress
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P0
- **Refs**: spec v2 §5
- **Description**: The `sit` signal is not a good measure (indirect) and not a good interaction (nobody taps "I stood up"). Remove from UI, API, and schema. Replace functionality with hourly standup reminder + passive steps.
- **Acceptance**:
  - [ ] UI shows only `wake / sleep / water`
  - [ ] `POST /api/signal` rejects `sit`
  - [ ] Schema constraint updated (migration applied)
  - [ ] No `sit` references remain in code
- **Notes**: Migration SQL is in spec v2 §3.1

### [P0-02] Fix silent failure in signal buttons

- **Status**: In Progress
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P0
- **Refs**: spec v2 §5, diagnostic report §3 F1
- **Description**: Clicking signal buttons sometimes does nothing. Suspected: fetch fails silently, or event not bound. Add error surface + optimistic update.
- **Acceptance**:
  - [ ] Clicking any signal button produces visible feedback within 100ms
  - [ ] Failed request shows an alert or inline error
  - [ ] Clicking the same idempotent signal twice does not create duplicate rows
  - [ ] Refresh preserves state
- **Notes**: Diagnosis first. Do not fix before reproducing. See AGENTS.md §3.3.

### [P0-03] Add signal definitions to system prompt

- **Status**: In Progress
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P0
- **Refs**: spec v2 §5, diagnostic report §3 F2
- **Description**: 元婴 fabricated meanings for the 4 buttons ("New session / History / Settings / Close"). Add explicit definitions to `core/identity.md` and `lib/yuanying.ts`.
- **Acceptance**:
  - [ ] 元婴 answers "How do the buttons work?" with accurate definitions
  - [ ] 元婴 says "我不知道" when asked something it doesn't know
  - [ ] No fabricated button meanings in test scenarios
- **Notes**: Voice rule "不确定时说不确定" added to `core/voice.md`.

---

## To Do

### [P1-01] Build reminder scheduler

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §6, Appendix A
- **Description**: Implement `lib/reminder-scheduler.ts` per spec Appendix A.2. Handles water / standup / vitamin logic.
- **Acceptance**:
  - [ ] `fireDueReminders()` runs without error
  - [ ] Water fires only when today's water count < 6
  - [ ] Standup fires only when no recent steps or app_usage in last 50 min
  - [ ] Vitamin fires only once per day
  - [ ] Duplicate prevention works (30-min window)

### [P1-02] Build reminder cron endpoints

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §4.3, §6.3
- **Description**: Add `/api/cron/water`, `/api/cron/standup`, `/api/cron/vitamin`. Configure `vercel.json`.
- **Acceptance**:
  - [ ] All three endpoints return 401 without `CRON_SECRET`
  - [ ] All three return `{ ok: true, fired: [...] }` with correct auth
  - [ ] `vercel.json` crons are deployed and visible in Vercel dashboard
  - [ ] Manual curl to each endpoint triggers expected reminder

### [P1-03] Build client reminder poller

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §6.2, Appendix A.4
- **Description**: `ReminderPoller` component that polls `/api/reminder/due` every 5 min and plays TTS + notification.
- **Acceptance**:
  - [ ] Component mounts in `app/layout.tsx`
  - [ ] Polls every 5 min without hammering the API
  - [ ] Plays Chinese TTS when reminder due
  - [ ] Displays notification if permission granted
  - [ ] De-duplicates reminders across page reloads

### [P1-04] Build `/api/reminder/due` and `/api/reminder/act`

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §4.2
- **Description**: Two endpoints for reminder delivery and acknowledgment.
- **Acceptance**:
  - [ ] `/due` returns only reminders with `shown_at IS NULL`
  - [ ] `/due` marks `shown_at = now` on return (to prevent re-delivery)
  - [ ] `/act` updates `acted_at` or `dismissed_at`
  - [ ] Both endpoints validated with manual curl

### [P1-05] Add reminder settings toggle

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §6.4
- **Description**: Settings page with per-reminder on/off toggles, backed by `config` table.
- **Acceptance**:
  - [ ] Toggle updates `config.reminders_enabled`
  - [ ] Disabled reminders do not fire
  - [ ] Change takes effect within 1 hour

### [P1-06] Implement HealthConnect step collection (Android)

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §7, Appendix B
- **Description**: Add `StepsCollector` (Kotlin preferred, see Appendix B.4), integrate into `CollectorWorker`, add permission request UI.
- **Acceptance**:
  - [ ] Permission flow works on Android 9+ with HealthConnect installed
  - [ ] Worker reports steps hourly
  - [ ] Supabase receives `name='steps'` signals
  - [ ] Permission denied path shows clear message, no crash

### [P1-07] Build `/api/steps`

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 Appendix B.8
- **Description**: POST endpoint to receive step counts, GET endpoint for today's total.
- **Acceptance**:
  - [ ] POST validates steps is a non-negative number
  - [ ] POST writes to `signals` with correct context
  - [ ] GET returns today's steps + goal
  - [ ] Malformed payloads rejected with 400

### [P1-08] Reference reminders + steps in chat

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 §6.3, §7
- **Description**: Extend `buildSystemPrompt()` to include recent reminders and today's steps.
- **Acceptance**:
  - [ ] 元婴 can answer "今天走了多少步?"
  - [ ] 元婴 can answer "我今天喝水够了吗?"
  - [ ] No fabrication when data is missing

---

## Blocked

*(empty)*

---

## In Review

### [P0-04] Fix 元婴 fabrication of button meanings

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P0
- **Refs**: diagnostic report §3 F2
- **Description**: Fix 元婴's fabrication and add "I don't know" behavior.
- **Acceptance**:
  - [x] `core/identity.md` includes signal definitions
  - [x] `core/voice.md` includes "不确定时说不确定"
  - [x] `lib/yuanying.ts` injects signal definitions into system prompt
  - [ ] Owner confirms in production test
- **Notes**: Owner screenshot shows 元婴 now says "我不知道。按定义…但你说不累加。可能是实现的问题" — fabrication fixed, uncertainty behavior working. Awaiting owner sign-off.

---

## Done

### [P0-00] Fix PWA not loading after install

- **Status**: Done
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Closed**: 2026-03-17
- **Phase**: P0
- **Refs**: spec v1 §4
- **Description**: PWA installed but nothing worked. Added Service Worker registration, fixed relative fetch paths, added error boundaries.
- **Notes**: Verified by owner on iOS Safari. Chat and buttons functional after fix.

### [P0-00b] Get Android collector permission working

- **Status**: Done
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Closed**: 2026-03-17
- **Phase**: P0
- **Refs**: spec v1 Appendix C
- **Description**: `PACKAGE_USAGE_STATS` permission flow. Collector shows "已授权。每小时自动上报。"
- **Notes**: Owner screenshot confirms permission granted and status text correct. Hourly reporting **not yet verified in Supabase** — see [P1-09] below.

---

## Backlog

Captured but not scheduled. No commitment. Do not work on these.

- **[B-01]** Passively detect wake / sleep from lock screen (Android `UsageEvents`)
- **[B-02]** iOS passive step collection via HealthKit
- **[B-03]** Desktop companion (menu bar / Tauri)
- **[B-04]** Animated avatar (currently static PNG)
- **[B-05]** Morning / evening briefings
- **[B-06]** Pattern engine (`inferred-patterns.md` → `confirmed-patterns.md`)
- **[B-07]** 元婴 persona customization UI (name, avatar, prompt)
- **[B-08]** Model router (DeepSeek → Claude → GPT fallback)
- **[B-09]** Voice input via Whisper (currently Web Speech API only)
- **[B-10]** Weekly digest
- **[B-11]** Stelio full migration (remaining 5 habits)
- **[B-12]** Share sheet integration (capture from any app)
- **[B-13]** Voice wake word
- **[B-14]** `activity_logs` pruning / retention policy

### Backlog rules

- Backlog items must be added by an agent or dev, not removed without owner approval.
- Adding to backlog is encouraged. Pulling from backlog is a scheduling decision, not a dev decision.
- The only exception: if a backlog item blocks a sprint item, escalate.

---

## Won't Do

Explicitly rejected. Reason recorded. Do not re-propose.

### [W-01] Habit tracking UI replicating Stelio

- **Reason**: 元婴's model is passive capture + active reminder, not open-app-and-tap. Replicating Stelio's UI would defeat the product.
- **Closed**: 2026-03-17

### [W-02] `sit` as a tracked signal

- **Reason**: Bad measure (indirect), bad interaction (nobody taps it). Replaced by passive steps + hourly standup reminder.
- **Closed**: 2026-03-17

### [W-03] Multi-user / accounts / authentication

- **Reason**: Single-user product for v2. Auth adds complexity with no value.
- **Closed**: 2026-03-17

### [W-04] Analytics / growth metrics / engagement loops

- **Reason**: Violates principle 2.1 (quiet by default). Product is not a growth business.
- **Closed**: 2026-03-17

---

## Changelog

Chronological record of state changes. Newest first.

### 2026-03-17

- Sprint v2 opened. Scope: 3 buttons, 3 reminders, steps.
- P0-00 (PWA loading) closed.
- P0-00b (Android collector permission) closed.
- P0-04 (fabrication fix) moved to In Review.
- `sit` signal removed from scope (W-02).
- Stelio migration plan finalized: only 4 of 9 habits carry over (see PRD §Stelio 迁移决策).

### 2026-03-16

- v1.1 PRD and v2 engineering spec written.
- Diagnostic report filed for F1 (buttons), F2 (fabrication), F3 (collector data flow).

### 2026-03-15 and earlier

- v1 prototype deployed. Chat working. 4 buttons present but non-functional.
- Android collector built. Permission flow works.

---

## Metrics We Track (Lightly)

Not for growth-hacking. For understanding whether the product is alive.

| Metric | Current | Target | Notes |
|---|---|---|---|
| Days owner opened PWA (last 7) | — | 5+ | Presence signal |
| Signals logged (last 7 days) | — | 15+ | Interaction signal |
| Reminders acted on | — | 40%+ | Value signal |
| Reminders dismissed | — | <30% | Friction signal |
| 元婴 "我不知道" instances | — | >0 | Honesty signal |

**Not tracked**: session length, DAU/MAU, retention curves, click-through. If it feels like a growth metric, it's the wrong metric.

---

## How to Add an Entry

1. Choose a status section (To Do, In Progress, etc.)
2. Assign an ID (`P<phase>-<seq>` for planned, `B-<seq>` for backlog, `W-<seq>` for won't-do)
3. Fill in owner, opened date, phase
4. Write description (why) and acceptance (how we know it's done)
5. Add refs to spec sections
6. Update the changelog at the bottom

**If you're an agent**: you may add To Do, In Progress, and Blocked entries. You may NOT add Done entries without verification. In Review is your terminal state until a human confirms.

---

**End of TRACKING.md**

```
##   

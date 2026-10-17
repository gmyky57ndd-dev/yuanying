# Work Order — 2026-10-16  
## From: Product owner To: Dev team Purpose: Single handoff. All documents, all tasks, all updates. No back-and-forth. Supersedes: Any earlier partial work order from 2026-10-15/16.  
##   
## 0. Reading order  
1. Read §1 (Context) — 2 minutes  
2. Apply §2 (Documents to create/update) — 1 hour  
3. Execute §3 (Today's fixes — ES-007) — full day  
4. Review §4 (Tomorrow's spec — ES-008) — read only  
5. Update §5 (TRACKING.md) — ongoing  
6. Follow §6 (Reporting) — daily  
## Do not reply in chat. Update TRACKING.  
##   
## 1. Context  
## Today's screenshot surfaced five issues. All are real. Two are bugs, two are model flaws, one is scope clarification.  
## Bugs:  
* Summary window shows today's partial data at 11am — it should show yesterday until evening  
* Steps show 0 despite Fit reporting ~6k  
## Model flaws:  
* Wake detection triggers on washroom unlocks  
* Actions and reminder responses are two counters; they should be one  
## Scope clarification:  
* C phase (UI/UX) starts today as spec, implementation tomorrow  
* Notes stay free text; no new capture surfaces; 元婴 derives structure  
## Also: 元婴's voice landed in the last summary ("昨晚到 01:28 还在用手机") but the data structure above it did not. ES-007 fixes the structure; ES-008 fixes the layout.  
##   
## 2. Documents to create or update  
## 2.1 Create these files (full content given below)  
##   
##   

| File | Content source |
| ---------------------------------------- | --------------------------------- |
| docs/specs/ES-007-actions-and-summary.md | §3 of this work order (full spec) |
| docs/specs/ES-008-c-phase-ui.md | §4 of this work order (full spec) |
| docs/pm/2026-10-16-feedback.md | §7 of this work order (PM record) |
  
****2.2 Update these existing files****  
##   
##   

| File | Change |
| ---------------- | ---------------------------------------------------------- |
| AGENTS.md | Apply §5.1 diff (v1.4 → v1.5) |
| TRACKING.md | Apply §5.2 additions |
| core/identity.md | Already updated — verify no signal list remains (see §5.3) |
  
****2.3 Do not create****  
* No new capture surfaces  
* No separate notes app  
* No new tabs beyond home + history  
* No new dependencies without approval  
##   
## 3. docs/specs/ES-007-actions-and-summary.md — full content  
```
markdown
# ES-007 — Actions, Summary Window, Wake Detection

**Status**: Approved
**Category**: Bug + model fix
**Depends on**: ES-005
**Tracking**: P1-21 through P1-25

---

## 1. Summary window — "今天" means last completed day

**Problem**: At 11:13 AM, the panel labeled "今天" shows today's
partial data (11 hours of an unfinished day). This is misleading.

**Rule**: The main summary reflects the most recently *completed* day,
not the current partial one.

- Before 18:00 local → show yesterday's full day, labeled "昨天"
- After 18:00 local → shift to today's running day, labeled "今天"
- After 00:00 → reset to "昨天" (yesterday's complete data)

**Implementation**:
- Add a `getDisplayDay()` helper in `lib/timezone.ts`
- Returns `{ date, label }` where label is "今天" or "昨天"
- PWA renders the label from this helper

**Acceptance**:
- [ ] At 11:00, panel shows yesterday's data with label "昨天"
- [ ] At 19:00, panel shows today's running data with label "今天"
- [ ] At 00:30, panel shows yesterday's data with label "昨天"
- [ ] No client-side time-of-day logic — the server returns the label

---

## 2. Wake detection — brief_wake vs wake

**Problem**: First phone unlock after sleep is logged as `wake`. A
washroom trip at 01:41 becomes a wake signal.

**Rule**: Distinguish brief wakes from morning wake.

- **Brief wake**: unlock within 4h of last `sleep` signal, re-lock
  within 10 min, no app_usage or steps follow within 30 min.
  → logged as `brief_wake`. Does not affect `wake`.
- **Morning wake**: unlock, then either (a) another unlock within 30
  min, or (b) app_usage or steps within 30 min, or (c) user confirms
  via prompt.
  → logged as `wake`.

**Prompt** (when ambiguous):
After an unlock that could be either, ask once:

```
## 醒了吗？ [是] [只是起夜]  
```
text
- "是" → `wake` signal
- "只是起夜" → `brief_wake` signal

One prompt per night maximum. If the user does not respond, treat as
brief_wake and do not re-prompt.

**Implementation**:
- `app/api/signal/route.ts` accepts `brief_wake` as a valid name
- Schema constraint updated: `name in ('wake','sleep','water','steps',
  'app_usage','phone_unlock','brief_wake','note','reminder_shown',
  'reminder_acted')`
- Summary generator: `wake` = only the confirmed or unambiguous wake
- `brief_wake` signals appear in raw day view, not in summary totals

**Acceptance**:
- [ ] 01:41 unlock → brief_wake (not wake)
- [ ] 07:20 unlock + app_usage within 30 min → wake
- [ ] Ambiguous unlock prompts once
- [ ] `brief_wake` never appears as "起床" in summary

---

## 3. Steps — diagnostic and fix

**Problem**: Summary shows 0/5000. Fit app shows ~6k yesterday.

**Diagnostic first** (30 min, log result in TRACKING):

```sql
select value, context, created_at
from signals
where name = 'steps'
  and created_at >= current_date - interval '2 days'
order by created_at desc;

```
## Decision tree:  
* All value = 0 → HealthConnect returns no data. Do NOT fix in code. Escalate: likely source mismatch (Fit vs HealthConnect internal counter) or permission scope.  
* Some value > 0 but summary shows 0 → aggregation bug. Apply fix below.  
* Steps signals missing entirely → collector not reporting. Check WorkManager logs.  
## Fix (if aggregation bug):  
```
typescript
// lib/summary-generator.ts
function pickDailySteps(signals: any[]): number {
  const steps = signals.filter(s => s.name === 'steps');
  if (steps.length === 0) return 0;
  // Steps are cumulative-within-day. Max snapshot = end-of-day total.
  return steps.reduce((max, s) => {
    const v = typeof s.value === 'number' ? s.value : 0;
    return Math.max(max, v);
  }, 0);
}

```
## Acceptance:  
* □ Diagnostic result recorded in TRACKING  
* □ If source mismatch: reported to owner, no code change  
* □ If aggregation bug: today's steps reflect max snapshot  
* □ Steps number matches Fit app within 10% (same source check)  
##   
## 4. Action model — one counter for actions  
## Problem: You clicked water twice manually. Summary says "water 0/3 acted" because "acted" only counts reminder responses. Two counters for one action.  
## Rule: There is one counter per habit — actions. A reminder is a prompt, not a separate metric.  
## Model:  
## An action can come from three sources:  
1. Manual tap on home screen  
2. Response to a reminder notification  
3. Passive detection (steps, brief_wake)  
## All three increment the same counter.  
## Water:  
* Target 6/day  
* Manual tap → +1 action  
* Reminder notification shows [喝了] [忽略]  
    * "喝了" → +1 action  
    * "忽略" → logged as ignored (audit only, no count change)  
* Manual tap while reminder is pending → +1 action; reminder auto-dismissed  
## Standup:  
* Target 8/day  
* Same as water: manual tap or [起身了] [忽略]  
## Vitamin:  
* Boolean per day  
* Once logged (manual or reminder), no more reminders today  
* Manual tap before reminder → reminder skipped  
* Timestamp recorded (for audit and pattern analysis)  
## Summary display:  
## Before:  
```
text
- water: 0/3 acted
- standup: 0/6 acted
- vitamin: 0/0 acted

```
## After:  
```
text
- 喝水 2/6
- 起身 3/8
- 维生素 ✓ 08:32

```
## Notification button implementation:  
* Android: notification action buttons (NotificationCompat.Builder.addAction)  
* PWA: notification action support varies by browser; fallback to tapping notification opens the app with the reminder modal  
## Acceptance:  
* □ Manual water tap increments the same counter as reminder response  
* □ Vitamin logged once → no more reminders that day  
* □ Summary shows 喝水 2/6, not 0/3 acted  
* □ Reminder notification has [action] [ignore] buttons  
* □ Ignored reminders logged in reminders table (audit only)  
##   
## 5. Data schema changes  
```
sql
-- Extend signal name constraint
alter table signals drop constraint if exists v2_signal_name;
alter table signals add constraint v3_signal_name check (
  name in (
    'wake', 'sleep', 'water', 'steps', 'app_usage', 'phone_unlock',
    'brief_wake', 'note', 'reminder_shown', 'reminder_acted'
  )
);

-- Reminder actions already have context field; add specific values
-- context = { habit: 'water'|'standup'|'vitamin', source: 'manual'|'reminder' }
-- No schema change; use existing context jsonb.

```
##   
## 6. Out of scope for ES-007  
* UI redesign (see ES-008)  
* Visual polish  
* New capture surfaces  
* Any change to ES-005 or ES-006 logic  
##   
## 7. Tracking entries  
```
markdown
### [P1-21] Summary window — 今天 = last completed day
- Status: To Do
- Category: Bug
- Refs: ES-007 §1

### [P1-22] Wake detection — brief_wake vs wake
- Status: To Do
- Category: Bug
- Refs: ES-007 §2

### [P1-23] Steps diagnostic + fix
- Status: To Do
- Category: Bug
- Refs: ES-007 §3

### [P1-24] Action model — unify counters
- Status: To Do
- Category: Feature
- Refs: ES-007 §4

### [P1-25] Reminder notification action buttons
- Status: To Do
- Category: Feature
- Refs: ES-007 §4

```
##   
**End of ES-007.**  
```
text
---

## 4. `docs/specs/ES-008-c-phase-ui.md` — full content

```markdown
# ES-008 — C Phase: UI/UX Scope

**Status**: Approved (spec locked; implementation starts tomorrow)
**Category**: Feature (UI)
**Depends on**: ES-007
**Tracking**: P1-26 through P1-29

---

## 1. Purpose

C is the experience upgrade. Structure, not aesthetics. Aesthetic polish
is a second C pass.

Two surfaces on mobile:
1. **Home** — today only
2. **History** — everything else, on demand

No third tab. No settings inside home. No dashboards.

---

## 1.6 Principle — no new capture surfaces

Every new input UI is a place the owner can abandon. The 元婴 must not
accumulate capture surfaces (notes app, habit app, journal, tags,
categories). Friction is the primary cause of abandonment in single-user
tools.

**Rule**: input rides on existing surfaces — chat, a single button, or
voice. A new surface is justified only when no existing surface can
carry the input, and the justification must be written into the spec.

**Applied to ES-008**:
- Note-taking rides on the existing "记一笔" button. No new app, no new
  tab for notes alone.
- History is a tab within the same surface, not a separate product.
- No user-facing categorization. See §2.3.

---

## 2.1 Home — today only

The main screen shows:

1. **Today's activities** — a vertical list, live and tappable
   - wake, sleep, water (with count), steps, vitamins
   - Each row tappable: tap water → +1, tap vitamin → log
   - The "今天/昨天" panel from ES-007 §1 is the header
   - Reminders integrated, not separate

2. **Conversation with 元婴** — the chat
   - Today's only
   - Yesterday's scrolls off, retrievable in History

**Layout**:
- Activities pinned at top (2-3 rows visible)
- Chat fills the rest
- "记一笔" button always accessible (floating or header)

**No**:
- Historical data on home
- Settings on home (moved to a menu)
- Charts, statistics, streaks

---

## 2.2 History — everything else

Second tab. List of days, newest first.

- Tap a day → full view:
  - All signals with timestamps
  - All notes with text
  - Reminders fired + responses
  - Conversation log for that day
  - Summary in prose
- Search: by date, by keyword (in notes)

**Cloud-first**:
- Home shows only today
- History loads on demand from Supabase
- Nothing cached on phone except current view

---

## 2.3 Notes — user writes free text, 元婴 derives structure

The owner is working on multiple projects, has many favorite things to
do, and many random thoughts. The temptation is to add `project` and
`kind` fields. Resist it.

**Rule**: the user writes free text. The 元婴 derives structure. The
user never categorizes. The 元婴 never asks the user to categorize.

**Implementation**:
- Note input is a text field (with optional mic). No dropdowns. No tags.
  No required fields.
- 元婴 extracts topic, project, and intent from the content when needed
  for recall. These are stored as 元婴-side metadata — never surfaced
  to the user as required input.
- When 元婴 gets categorization wrong, it self-corrects on next encounter.
  It does not ask the user to fix it.
- Editing past notes is out of scope (per ES-002). Re-categorization is
  not a user action.
- Recall: "上次我们聊到提案的那个问题" — 元婴 retrieves by inferred
  topic, not by user-applied tag.

**Why this is stronger than tags**: tags require the owner to *decide*
at capture time. Decisions at capture time cause the capture to be
skipped. The whole point of the 元婴 is to reduce decisions, not add
them.

**Interaction with ES-006**: 元婴-extracted topics from notes are the
input to Detector 1 (avoidance via adjacent tasks). Free-text capture
and learned structure are the same mechanism — not two competing models.

---

## 2.4 Visual direction (deferred)

Not in scope for this phase. Existing palette (stone), single green
accent. Polish is a second C pass, after structure is right.

---

## 2.5 Out of scope

- Avatar animation — later C
- Laptop companion — later C
- Model router — later C
- Onboarding flow — later C
- Themes, dark/light toggle — later C

---

## 3. Acceptance criteria

- [ ] Home shows only today's activities + chat
- [ ] No historical data on home
- [ ] History tab shows day list, tappable to detail view
- [ ] Detail view shows signals, notes, reminders, chat, prose summary
- [ ] Search by date and keyword works
- [ ] "记一笔" is one tap from home
- [ ] Note input has no dropdowns, no tags, no required fields
- [ ] No new capture surfaces introduced
- [ ] Settings moved off home
- [ ] No charts, no statistics

---

## 4. Tracking entries

```markdown
### [P1-26] Home redesign — activities + chat only
- Status: To Do
- Category: Feature
- Refs: ES-008 §2.1

### [P1-27] History tab — day list + detail
- Status: To Do
- Category: Feature
- Refs: ES-008 §2.2

### [P1-28] Note capture — free text, no metadata
- Status: To Do
- Category: Feature
- Refs: ES-008 §2.3

### [P1-29] Move settings off home
- Status: To Do
- Category: Feature
- Refs: ES-008 §2.1

```
##   
**End of ES-008.**  
```
text
---

## 5. Document updates

### 5.1 `AGENTS.md` — v1.4 → v1.5 diff

**Insert A** — §5.2 Never do, append after bullet 9:

```markdown
10. Add a new capture surface without exhausting existing ones. Every
    interface is a place the product can die — the more surfaces the
    owner must visit, the more likely one gets abandoned. Before adding
    any input UI, ask: can this ride on chat, a single button, or voice?
    If yes, do that. New surfaces exist only when no existing surface
    can carry the input.

```
## Insert B — §8 Common failure modes, after "Timezone blindness":  
```
markdown
- **Interface proliferation:** every new capture surface is a place the
  owner can abandon the last one. The owner's attention is the scarce
  resource, not the feature count. Before adding any input UI, exhaust
  existing surfaces (chat, one button, voice). If a new surface is truly
  necessary, it must justify why no existing surface can carry the input
  — and the justification goes in the spec, not assumed.

```
## Changelog — append at top of §11:  
```
markdown
### v1.5 — 2026-10-16
- Added §5.2 bullet 10 (no new capture surfaces without exhausting existing ones)
- Added §8 Interface proliferation failure mode
- Context: ES-008 C-phase UI. Note-taking must ride on existing surfaces,
  not create parallel input paths. Friction is the primary cause of
  abandonment in single-user tools.

```
## 5.2 TRACKING.md — additions  
## Add these entries (verbatim):  
```
markdown
### [P1-21] Summary window — 今天 = last completed day
### [P1-22] Wake detection — brief_wake vs wake
### [P1-23] Steps diagnostic + fix
### [P1-24] Action model — unify counters
### [P1-25] Reminder notification action buttons
### [P1-26] Home redesign — activities + chat only
### [P1-27] History tab — day list + detail
### [P1-28] Note capture — free text, no metadata
### [P1-29] Move settings off home

```
Each with fields: Status: To Do, Category, Refs, Owner: @dev.  
## Move [B-21] from Backlog to Bug if steps diagnostic confirms aggregation bug. Otherwise leave in Backlog.  
## 5.3 core/identity.md — verify  
## Confirm no signal list remains. Per ES-005 follow-up, signal definitions should live in the runtime section of lib/yuanying.ts, not in identity. If the list is still present, remove it.  
##   
## 6. Reporting rules  
1. Update TRACKING.md at end of each task — not end of day  
2. Mark In Review when code + deploy complete  
3. Owner verifies → Done with date and evidence  
4. If blocked >2h, mark Blocked with reason in TRACKING  
5. Do not reply in chat — update TRACKING  
6. Do not expand scope silently — mark Blocked with question  
##   
## 7. docs/pm/2026-10-16-feedback.md — full content  
```
markdown
# PM Feedback — 2026-10-16

**Session**: Post-deploy review, day 3 of daily use
**Participants**: Owner, 元婴
**Context**: Screenshot review of PWA home screen at 11:13 AM
**Status**: Decisions frozen

---

## 1. Observations

### 1.1 Summary window

"今天" panel at 11:13 AM shows today's partial day. Owner: "today
just started, doesn't make sense to report."

### 1.2 Wake detection

Wake logged at 01:41 AM. Owner: "I may woke up go to washroom but did
not wake up at that time."

### 1.3 Steps

Summary shows 0. Fit app shows ~6k yesterday.

### 1.4 Reminder counts

"0/3 acted" doesn't reflect owner's manual actions. Owner clicked
water twice; summary shows 0/3.

### 1.5 UI

"Main page should only show each day's activities and the conversations.
Historical summaries on separate tab. Details packed up and save to
cloud."

### 1.6 Note taking

"Just make the note taking easy not invent another interface otherwise
just adding more work and will increase the possibility to abandon
the activity."

---

## 2. Decisions

| # | Decision |
|---|---|
| D1 | Summary window = last completed day, not current partial |
| D2 | brief_wake vs wake — distinguish washroom trips |
| D3 | Steps diagnostic first; fix depends on root cause |
| D4 | One counter for actions; reminders are prompts, not metrics |
| D5 | Reminder notifications get [action] [ignore] buttons |
| D6 | Home = today only; History = separate tab |
| D7 | Notes are free text; 元婴 derives structure |
| D8 | No new capture surfaces — friction kills the tool |

---

## 3. Deferred

- Visual polish (second C pass)
- Avatar animation (later C)
- Laptop companion (later C)
- Model router (later C)

---

## 4. Signals to 元婴

- Owner is direct about what's wrong. No softening.
- Owner knows the difference between a data structure problem and a
  design problem.
- Owner is protective of the tool's own survival — "will increase the
  possibility to abandon."
- Owner wants structure from the system, not structure the user must
  supply.

---

## 5. Artifacts

- `docs/specs/ES-007-actions-and-summary.md`
- `docs/specs/ES-008-c-phase-ui.md`
- `AGENTS.md` v1.5
- `TRACKING.md` (P1-21 through P1-29)

---

## 6. Follow-ups

- ES-007 today
- ES-008 spec locked, implementation tomorrow
- Next PM session: after ES-008 ships

---

**End of PM doc.**

```

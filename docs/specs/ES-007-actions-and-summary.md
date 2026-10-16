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
## 醒了吗？
[是] [只是起夜]
```

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

**Decision tree**:
- All value = 0 → HealthConnect returns no data. Do NOT fix in code.
  Escalate: likely source mismatch (Fit vs HealthConnect internal counter)
  or permission scope.
- Some value > 0 but summary shows 0 → aggregation bug. Apply fix below.
- Steps signals missing entirely → collector not reporting. Check
  WorkManager logs.

**Fix (if aggregation bug)**:

```typescript
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

**Acceptance**:
- [ ] Diagnostic result recorded in TRACKING
- [ ] If source mismatch: reported to owner, no code change
- [ ] If aggregation bug: today's steps reflect max snapshot
- [ ] Steps number matches Fit app within 10% (same source check)

---

## 4. Action model — one counter for actions

**Problem**: You clicked water twice manually. Summary says "water 0/3
acted" because "acted" only counts reminder responses. Two counters for
one action.

**Rule**: There is one counter per habit — actions. A reminder is a
prompt, not a separate metric.

**Model**:
An action can come from three sources:
1. Manual tap on home screen
2. Response to a reminder notification
3. Passive detection (steps, brief_wake)

**All three increment the same counter.**

**Water**:
- Target 6/day
- Manual tap → +1 action
- Reminder notification shows [喝了] [忽略]
  - "喝了" → +1 action
  - "忽略" → logged as ignored (audit only, no count change)
- Manual tap while reminder is pending → +1 action; reminder auto-dismissed

**Standup**:
- Target 8/day
- Same as water: manual tap or [起身了] [忽略]

**Vitamin**:
- Boolean per day
- Once logged (manual or reminder), no more reminders today
- Manual tap before reminder → reminder skipped
- Timestamp recorded (for audit and pattern analysis)

**Summary display**:

Before:
```
- water: 0/3 acted
- standup: 0/6 acted
- vitamin: 0/0 acted
```

After:
```
- 喝水 2/6
- 起身 3/8
- 维生素 ✓ 08:32
```

**Notification button implementation**:
- Android: notification action buttons (NotificationCompat.Builder.addAction)
- PWA: notification action support varies by browser; fallback to tapping
  notification opens the app with the reminder modal

**Acceptance**:
- [ ] Manual water tap increments the same counter as reminder response
- [ ] Vitamin logged once → no more reminders that day
- [ ] Summary shows 喝水 2/6, not 0/3 acted
- [ ] Reminder notification has [action] [ignore] buttons
- [ ] Ignored reminders logged in reminders table (audit only)

---

## 5. Data schema changes

```sql
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

---

## 6. Out of scope for ES-007

- UI redesign (see ES-008)
- Visual polish
- New capture surfaces
- Any change to ES-005 or ES-006 logic

---

## 7. Tracking entries

```markdown
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

**End of ES-007.**

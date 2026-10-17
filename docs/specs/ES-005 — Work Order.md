# ES-005 — Work Order (v2, owner-independent)  
## Filed: 2026-10-15 Audience: Dev team Purpose: Execute today. No owner blocker. Owner refines in parallel.  
##   
## PART A — What changed from v1  
## v1 was wrong. It made the owner's core/ground-rules.md a blocking dependency for the whole work order. That conflated two things:  
* The **file's existence** (needed by the prompt loader)  
* The **file's content** (owner's ongoing work, never "done")  
## Separate them. Seed the file with observed defaults. Ship it. Owner edits when they want. Dev never blocks.  
##   
## PART B — Seed file  
## Ship this as core/ground-rules.md. Authored by 元婴, based on observed patterns from the last three weeks. Owner replaces content over time. Structure stays.  
```
markdown
# Ground Rules

元婴 reads. Owner writes. Seeded 2026-10-15.
Owner replaces content as needed — this file is never "done."

---

## Silence

When I don't want to hear from you.

- 睡不足 5 小时的那天，别谈工作。
- 深夜（22:00 后）除非紧急，不主动说。
- 说 "later" 的时候，是 2 小时，不是第二天。
- 不要总结我的一天，除非我问。

## Interpretation

What signals mean in my life.

- 深夜用 app 通常不是在 productive，是在回避睡觉。
- 长时间沉默（3 天以上不打卡）通常是出差或生病，不是放弃。
- 笔记突然变多通常是压力期，不是空闲期。

## Escalation

When you should push back.

- 我说 "没事" 但连续 3 天睡眠 < 6 小时 → 问一次。
- 一周没点 "起身" → 问一次是不是在出差。
- 一个模式问一次。不重复。

## Context

What's going on right now. Update as life changes.

- 时间：美东，常跨时区。
- 最近在推进元婴的 P1 阶段。

## Learning

Things I'm working on. Watch quietly, don't cheerlead.

- 减少深夜工作。
- 一周至少 3 次起身活动。

```
## Note for dev: this is a starting point, not gospel. The prompt loader must accept an empty file, a missing file, or this content. Handle all three.  
##   
## PART C — Dev team: everything to execute  
## C.1 Start now (no blockers)  
##   
##   

| # | Task | Ref | Est |
| - | -------------------------------------------------------------------------- | ---- | ------ |
| 1 | Steps signal diagnostic — is value 0 or is aggregation wrong? | §E.3 | 30 min |
| 2 | summaries.type migration | §E.2 | 10 min |
| 3 | Reminder cadence — quiet window, 2h standup, miss-after-60min, daily cap 6 | §E.2 | 2h |
| 4 | Weekly digest endpoint + lib/digest-generator.ts | §E.4 | 3h |
| 5 | Voice pass — core/voice.md + system prompt rule | §E.1 | 2h |
| 6 | Prompt integration — load core/ground-rules.md + priority order | §E.5 | 2h |
  
****All six start today. None blocks on owner.****  
## C.2 TRACKING.md updates (copy verbatim)  
```
markdown
### [P1-16] Voice pass — 元婴 speaks, not reports

- Status: To Do
- Category: Bug (voice violates core/voice.md)
- Refs: ES-005 §E.1
- Owner: @dev

### [P1-17] Reminder cadence — quiet window, 2h standup, cap 6/day

- Status: To Do
- Category: Bug (9/day violates quiet-by-default)
- Refs: ES-005 §E.2
- Owner: @dev

### [P1-18] Weekly digest endpoint

- Status: To Do
- Category: Feature
- Refs: ES-005 §E.4
- Owner: @dev

### [P1-19] Ground rules file + prompt integration

- Status: To Do
- Category: Feature
- Refs: ES-005 §E.5
- Owner: @dev
- Notes: Seed content in ES-005 §B. Owner refines over time. Do not wait.

```
## Add to Backlog:  
```
markdown
- [B-21] Steps signal diagnostic (value 0 vs summation bug) — reclassify if confirmed

```
## Add to docs/pm/:  
```
markdown
- `2026-10-15-option-a.md` — decision to do Option A before P2/v2

```
## Do not create a bug entry for timezone confusion. B-19 already covers it.  
## C.3 Doc updates  
##   
##   

| Doc | Change |
| ---------------------------- | ---------------------------------------------- |
| core/voice.md | Add bad/good example table (§E.1) |
| core/ground-rules.md | Create with seed content from §B |
| lib/yuanying.ts | Load ground rules; enforce priority order |
| lib/summary-generator.ts | Fix pickLatestStepsValue per §E.3 |
| lib/reminder-scheduler.ts | Quiet window, cadence, miss-after-60min, cap 6 |
| app/api/digest/week/route.ts | New |
| lib/digest-generator.ts | New |
| summaries table | Add type column (§E.2) |
  
****C.4 Do not****  
* Redesign home screen — Phase v2  
* Add pattern detection — P2  
* Build UI for ground rules — owner uses git  
* Touch core/identity.md or core/values.md  
* Create new bug entries beyond B-21  
* Reply in chat — update TRACKING  
## C.5 Reporting  
* Update TRACKING at end of each task  
* Mark In Review when code + deploy complete  
* If blocked >2h, mark Blocked with reason in TRACKING  
* If scope expands, mark Blocked with question. Do not expand silently  
##   
## PART D — Owner action (non-blocking)  
**Optional. Do whenever.**  
## Edit core/ground-rules.md in the repo. Commit. Done. No one waits on this.  
* The seed content is real but generic — it's from observed patterns, not stated by you.  
* Change anything that isn't true. Add anything missing.  
* No timeline. No notification. The file evolves at the pace you live.  
## If you never touch it, the seed stays and 元婴 uses it. That's a valid outcome. It's better than empty.  
## Why this is non-blocking: the file's content is iteratively shaped. The file's existence is required. Separate them. Ship v0 today. Edit later.  
##   
## PART E — Engineering spec  
## E.1 Voice pass  
## Problem: 元婴 speaks in data-dump format.  
## Goal: Data-summarizing responses start with a sentence, not a field.  
## Add to core/voice.md:  
```
markdown
## When reporting data

Speak as a person noticing, not a system reporting.
Begin with a sentence. Numbers serve the sentence.

### Examples

Bad: "Everything collected, US Eastern. Signals: app_usage 18:58, 20:01..."
Good: "昨晚到 1:28 还在用手机。"

Bad: "Water: 2/6. Reminders: water 0/3 acted."
Good: "喝了两杯水。提醒发了三次，没接。"

Bad: "Steps: 0/5000."
Good: "今天还没动。"

Bad: "Wake: 01:41 (Oct 15 ET)."
Good: "你 1:41 醒的。"

### Rules

- No bullets named "Signals" / "Totals" / "Reminders" in chat
- No ISO timestamps in chat unless owner asks
- No timezone labels in chat unless cross-timezone is relevant

```
## Add to system prompt (lib/yuanying.ts):  
```
text
When reporting data, speak as a person noticing, not a system reporting.
Begin with a sentence. Numbers serve the sentence.

```
## Acceptance:  
* □ Chat response to "看今天简报" starts with a sentence  
* □ No bullets named "Signals" / "Totals" / "Reminders"  
* □ Numbers appear inside sentences  
## E.2 Schema + cadence  
## Migration:  
```
sql
alter table summaries add column if not exists type text not null default 'day'
  check (type in ('day', 'week'));

alter table summaries drop constraint if exists summaries_date_timezone_key;
alter table summaries add constraint summaries_date_timezone_type_key
  unique (date, timezone, type);

```
## Reminder cadence (lib/reminder-scheduler.ts):  
* Quiet window: skip fire if current time in config.timezone is 22:00–07:00  
* Standup: interval_min 60 → 120  
* Miss-after-60min: set missed_at when shown_at set, acted_at null, and now - shown_at > 60min  
* Daily cap: 6 total across all habits. Exceeded → skip lowest-priority habit silently  
* Missed reminders during quiet window: no backfill  
## Acceptance:  
* □ No reminders fire 22:00–07:00 (user tz)  
* □ Standup fires ≤5×/day  
* □ Water fires ≤3×/day  
* □ Vitamin fires ≤1×/day  
* □ Total ≤6/day  
* □ Missed >60min = missed, no re-fire  
## E.3 Steps diagnostic + fix  
## Diagnostic (record in TRACKING):  
```
sql
select value, context, created_at
from signals
where name = 'steps'
  and created_at >= current_date
order by created_at desc;

```
* If all value = 0 → HealthConnect issue → escalate, don't fix in code  
* If some value > 0 but summary shows 0 → aggregation bug → fix below  
## Fix:  
```
typescript
// lib/summary-generator.ts
function pickLatestStepsValue(signals: any[]): number {
  const steps = signals.filter(s => s.name === 'steps');
  if (steps.length === 0) return 0;
  // Steps are cumulative-within-day; take max snapshot, not last.
  return steps.reduce((max, s) => {
    const v = typeof s.value === 'number' ? s.value : 0;
    return Math.max(max, v);
  }, 0);
}

```
## Acceptance:  
* □ Diagnostic result recorded in TRACKING  
* □ If bug: today's steps reflect max of day's snapshots  
* □ Steps line and summary agree  
## E.4 Weekly digest  
## File: app/api/digest/week/route.ts  
```
typescript
import { NextResponse } from 'next/server';
import { getConfigTimezone } from '@/lib/timezone';
import { generateWeeklyDigest } from '@/lib/digest-generator';

export const runtime = 'nodejs';

export async function GET() {
  const tz = await getConfigTimezone();
  const result = await generateWeeklyDigest({ timezone: tz });
  return NextResponse.json(result);
}

```
## File: lib/digest-generator.ts — aggregates last 7 daily summaries, computes averages, produces prose.  
## Output format:  
```
markdown
# Week of 2026-10-09

4 天有记录。3 天没有。

睡眠：4 晚在 23:30 后睡。2 晚在 1:00 后。
喝水：平均 3.4 / 6。
步数：平均 2,180 / 5,000。
笔记：5 条。都关于工作。

有一条我注意到——但我先不说，等你问。

```
## Acceptance:  
* □ Endpoint returns current week's digest  
* □ Prose, not fields  
* □ Last line holds pattern without asserting it  
* □ No charts, no tables  
* □ Stored in summaries with type='week'  
## E.5 Prompt integration  
## buildSystemPrompt() order:  
```
text
1. core/identity.md
2. core/values.md
3. core/voice.md
4. core/ground-rules.md
5. Runtime section
   - Priority order reminder (explicit, numbered)
   - Signal definitions
   - Today at a glance
   - Recent reminders
   - Owner notes (today)

```
## Prompt priority block:  
```
text
## Priority order (strict)

1. Confirm before action — never act on inference.
2. Ground rules — owner intent. Follow over your heuristics.
3. Voice — the register in which you speak.
4. Generic heuristics — fallback only.

Ground rules cannot override priority 1.

```
## Handle three cases:  
* File exists, has content → load normally  
* File exists, empty → skip section 4, no crash  
* File missing → log warning once, skip section 4, no crash  
## Acceptance:  
* □ core/ground-rules.md loaded on every session  
* □ Seed rule "sleep < 5h → no work topics" honored in test  
* □ Empty file: no crash  
* □ Missing file: no crash, warning logged  
* □ Priority order enforced  
## E.6 Out of scope  
* UI for ground rules  
* Pattern detection (P2)  
* Avatar work (Phase v2)  
* Notification system redesign  
* Schema beyond summaries.type  
##   
## PART F — What changed and why  
## v1 made owner the blocker. Wrong model. The owner's file is content, not a gate.  
## v2 seeds the file. Dev ships v0 today. Owner edits at their own pace. The prompt loader handles all three cases (present / empty / missing).  
## Result: dev works today. Owner works when they want. Neither waits.  
## One rule: The seed content in core/ground-rules.md is real but provisional. Treat it as a starting point. If the owner edits, honor the edit. If not, the seed stays.  
## The file is not a deliverable. It's a relationship. Relationships take time.  
##   
## PART G — Verification  
## After all tasks ship, verify against yesterday's symptoms:  
##   
##   

| Symptom                      | Expected after                      |
| ---------------------------- | ----------------------------------- |
| Data-dump chat               | Sentence-first, no field bullets    |
| 9 reminders/day              | ≤6/day, quiet window honored        |
| Steps 0/5000 despite signals | Correct value reflects max snapshot |
| No weekly aggregate          | /api/digest/week returns prose      |
| Ground rules absent          | Seeded file loaded; owner-editable  |
  
****If any fails, reopen the corresponding task. If all pass, ES-005 closed.****  

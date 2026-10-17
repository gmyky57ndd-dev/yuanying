# APPENDIX for 1014 response  
  
# APPENDIX-A-daily-summary-v1.md  
```
text
# Appendix A — Daily Summary v1 — Implementation Spec

**Refs**: yuanying-engineering-spec-v2.md, AGENTS.md v1.2 §5.4
**Category**: Feature (P1-11)
**Depends on**: B-16 (water scoping fix) — see Appendix B

---

## A.1 Design Target

Daily summary is the first aggregation layer. It collapses the day's
signals into one record, feeding P2's pattern engine.

**v1 scope: aggregation only. No pattern detection.**

| In scope | Out of scope |
|---|---|
| Aggregate signals + reminders + app_usage | Pattern detection |
| Write to `summaries` table | Trend comparison |
| Retrievable from chat | Recommendations |
| Generates on empty days too | Visualization |

---

## A.2 Data Model

```sql
create table if not exists summaries (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  date        date not null,
  timezone    text not null default 'Asia/Shanghai',
  data        jsonb not null,
  unique (date, timezone)
);

create index if not exists idx_summaries_date
  on summaries (date desc);
create index if not exists idx_summaries_tz_date
  on summaries (timezone, date desc);

create or replace function update_summaries_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_summaries_updated_at on summaries;
create trigger trg_summaries_updated_at
  before update on summaries
  for each row
  execute function update_summaries_updated_at();

```
## data field schema:  
```
typescript
interface SummaryData {
  wake: { at: string | null };
  sleep: { at: string | null; duration_min: number | null };
  water: { count: number; target: number };
  steps: { value: number; goal: number };
  reminders: {
    water:   { shown: number; acted: number };
    standup: { shown: number; acted: number };
    vitamin: { shown: number; acted: number };
  };
  top_apps: Array<{ name: string; minutes: number }>;
  signals_total: number;
  generated_at: string;
}

```
##   
## A.3 Timezone Utility (mandatory)  
## lib/timezone.ts:  
```
typescript
/**
 * Timezone utilities.
 *
 * Per AGENTS.md §5.4: all "today" queries use the user's local timezone,
 * not the server's (Vercel = UTC) and not the browser's.
 */

export interface DayRange {
  start: Date;   // UTC instant equal to 00:00 in the given timezone
  end: Date;     // UTC instant equal to next 00:00
  date: string;  // "YYYY-MM-DD" in the given timezone
}

function getTimezoneOffsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10) - 1,
    parseInt(get('day'), 10),
    hour,
    parseInt(get('minute'), 10),
    parseInt(get('second'), 10)
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

export function getDateInTimezone(tz: string, at: Date = new Date()): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return dtf.format(at);
}

export function getDayRange(date: string, tz: string): DayRange {
  const [year, month, day] = date.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetMin = getTimezoneOffsetMinutes(tz, anchor);
  const start = new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMin * 60000
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, date };
}

export function getTodayRange(tz: string, at: Date = new Date()): DayRange {
  const date = getDateInTimezone(tz, at);
  return getDayRange(date, tz);
}

/**
 * Read the user's timezone from config with a safe default.
 * Cacheable per request; do not cache across requests (config may change).
 */
import { supabase } from './db';
export async function getConfigTimezone(): Promise<string> {
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'timezone')
    .single();
  const tz = typeof data?.value === 'string' ? data.value : 'Asia/Shanghai';
  // Sanity check: must be a valid IANA timezone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    console.warn(`invalid timezone in config: ${tz}, falling back to Asia/Shanghai`);
    return 'Asia/Shanghai';
  }
}

```
##   
## A.4 Summary Generator  
## lib/summary-generator.ts:  
```
typescript
import { supabase } from './db';
import { getDayRange, getTodayRange, getConfigTimezone, DayRange } from './timezone';

export interface SummaryData {
  wake: { at: string | null };
  sleep: { at: string | null; duration_min: number | null };
  water: { count: number; target: number };
  steps: { value: number; goal: number };
  reminders: {
    water:   { shown: number; acted: number };
    standup: { shown: number; acted: number };
    vitamin: { shown: number; acted: number };
  };
  top_apps: Array<{ name: string; minutes: number }>;
  signals_total: number;
  generated_at: string;
}

const WATER_TARGET_DEFAULT = 6;
const STEPS_GOAL_DEFAULT = 5000;
const TOP_APPS_LIMIT = 5;

async function loadConfig() {
  const { data } = await supabase.from('config').select('key, value');
  const config = Object.fromEntries((data ?? []).map(r => [r.key, r.value]));
  return {
    timezone: (config.timezone as string) ?? 'Asia/Shanghai',
    steps_goal:
      typeof config.steps_goal === 'number'
        ? config.steps_goal
        : STEPS_GOAL_DEFAULT,
  };
}

export async function generateSummary(opts?: {
  date?: string;
  timezone?: string;
}): Promise<{ date: string; timezone: string; data: SummaryData }> {
  const config = await loadConfig();
  const tz = opts?.timezone ?? config.timezone;

  const range: DayRange = opts?.date
    ? getDayRange(opts.date, tz)
    : getTodayRange(tz);

  const [signalsRes, remindersRes] = await Promise.all([
    supabase
      .from('signals')
      .select('name, value, context, created_at')
      .gte('created_at', range.start.toISOString())
      .lt('created_at', range.end.toISOString())
      .order('created_at', { ascending: true }),
    supabase
      .from('reminders')
      .select('name, scheduled_at, shown_at, acted_at, dismissed_at')
      .gte('scheduled_at', range.start.toISOString())
      .lt('scheduled_at', range.end.toISOString()),
  ]);

  const signals = signalsRes.data ?? [];
  const reminders = remindersRes.data ?? [];

  const data: SummaryData = {
    wake: pickWake(signals),
    sleep: pickSleep(signals),
    water: {
      count: signals.filter(s => s.name === 'water').length,
      target: WATER_TARGET_DEFAULT,
    },
    steps: {
      value: pickLatestStepsValue(signals),
      goal: config.steps_goal,
    },
    reminders: {
      water:   countReminders(reminders, 'water'),
      standup: countReminders(reminders, 'standup'),
      vitamin: countReminders(reminders, 'vitamin'),
    },
    top_apps: pickTopApps(signals, TOP_APPS_LIMIT),
    signals_total: signals.length,
    generated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('summaries')
    .upsert(
      { date: range.date, timezone: tz, data },
      { onConflict: 'date,timezone' }
    );

  if (error) {
    throw new Error(`summary upsert failed: ${error.message}`);
  }

  return { date: range.date, timezone: tz, data };
}

// ---------- helpers ----------

function pickWake(signals: any[]) {
  const s = signals.find(x => x.name === 'wake');
  return { at: s?.created_at ?? null };
}

function pickSleep(signals: any[]) {
  const s = signals.find(x => x.name === 'sleep');
  if (!s) return { at: null, duration_min: null };
  const wake = signals.find(x => x.name === 'wake');
  let duration: number | null = null;
  if (wake) {
    const sleepAt = new Date(s.created_at).getTime();
    const wakeAt = new Date(wake.created_at).getTime();
    if (wakeAt > sleepAt) duration = Math.round((wakeAt - sleepAt) / 60000);
  }
  return { at: s.created_at, duration_min: duration };
}

function pickLatestStepsValue(signals: any[]): number {
  const steps = signals.filter(s => s.name === 'steps');
  if (steps.length === 0) return 0;
  const latest = steps[steps.length - 1];
  return typeof latest.value === 'number' ? latest.value : 0;
}

function countReminders(rows: any[], name: string) {
  const matching = rows.filter(r => r.name === name);
  return {
    shown: matching.filter(r => r.shown_at).length,
    acted: matching.filter(r => r.acted_at).length,
  };
}

function pickTopApps(signals: any[], limit: number) {
  const totals: Record<string, { name: string; minutes: number }> = {};
  for (const s of signals) {
    if (s.name !== 'app_usage') continue;
    const v = s.value ?? {};
    const pkg = v.package;
    if (!pkg) continue;
    if (!totals[pkg]) totals[pkg] = { name: v.name ?? pkg, minutes: 0 };
    totals[pkg].minutes += typeof v.duration_min === 'number' ? v.duration_min : 0;
  }
  return Object.values(totals)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}

```
##   
## A.5 API Endpoints  
## A.5.1 POST /api/summary/generate  
## app/api/summary/generate/route.ts:  
```
typescript
import { NextRequest, NextResponse } from 'next/server';
import { generateSummary } from '@/lib/summary-generator';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const date = typeof body?.date === 'string' ? body.date : undefined;
    const timezone = typeof body?.timezone === 'string' ? body.timezone : undefined;

    const result = await generateSummary({ date, timezone });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('summary generate failed:', err);
    return NextResponse.json(
      { error: err?.message ?? 'internal error' },
      { status: 500 }
    );
  }
}

```
## A.5.2 GET /api/summary/today  
## app/api/summary/today/route.ts:  
```
typescript
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getTodayRange, getConfigTimezone } from '@/lib/timezone';
import { generateSummary } from '@/lib/summary-generator';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const tz = await getConfigTimezone();
    const { date } = getTodayRange(tz);

    const { data: existing } = await supabase
      .from('summaries')
      .select('*')
      .eq('date', date)
      .eq('timezone', tz)
      .single();

    if (existing) {
      return NextResponse.json({
        date: existing.date,
        timezone: existing.timezone,
        data: existing.data,
        updated_at: existing.updated_at,
        cached: true,
      });
    }

    const result = await generateSummary({ date, timezone: tz });
    return NextResponse.json({ ...result, cached: false });
  } catch (err: any) {
    console.error('summary today failed:', err);
    return NextResponse.json(
      { error: err?.message ?? 'internal error' },
      { status: 500 }
    );
  }
}

```
## A.5.3 Deprecate GET /api/summary  
## The v1 endpoint returns a lighter aggregate. Deprecate it: either remove it or make it a thin alias to /api/summary/today. Do not keep two endpoints doing the same job.  
##   
## A.6 Chat Integration  
## lib/yuanying.ts — extend buildSystemPrompt() to accept a summary:  
```
typescript
interface BuildOptions {
  signals?: Array<{ name: string; created_at: string }>;
  summary?: SummaryData;
  now?: string;
}

export function buildSystemPrompt(opts: BuildOptions = {}): string {
  const core = loadCore();
  const signalCtx = buildSignalContext(opts.signals ?? []);
  const summaryLine = opts.summary ? buildSummaryLine(opts.summary) : '';
  const now = opts.now ?? new Date().toISOString();

  return `${core}

---

# Runtime

You are running as a phone PWA prototype.
Keep responses short — this is a phone screen.

## Signal definitions

- **wake** — user wakes up (once per day).
- **sleep** — user goes to sleep (once per day).
- **water** — user drinks water (multiple times per day, cumulative).

If the user asks what these buttons do, answer from the definitions above.
Do not invent other meanings.
If you don't know something, say so. Do not fabricate.

## Current time

${now}

Timezone: Asia/Shanghai
${summaryLine}
${signalCtx}
`;
}

function buildSummaryLine(s: SummaryData): string {
  return `
## Today at a glance

- Wake: ${s.wake.at ?? 'not logged'}
- Water: ${s.water.count} / ${s.water.target}
- Steps: ${s.steps.value} / ${s.steps.goal}
- Reminders:
  - water: ${s.reminders.water.acted}/${s.reminders.water.shown} acted
  - standup: ${s.reminders.standup.acted}/${s.reminders.standup.shown} acted
  - vitamin: ${s.reminders.vitamin.acted}/${s.reminders.vitamin.shown} acted

If the user asks for "看今天的简报" or "today's summary", format the above
into a short readable reply. Do not add interpretation.
`;
}

```
## Chat triggers — the user may invoke:  
* "看今天的简报" / "今日简报" / "today's summary"  
* "我今天怎么样" / "how was my day"  
## Both should produce a formatted summary, not interpretation.  
##   
## A.7 Trigger Strategy  
## v1 (this phase) — Manual + first-visit:  
* On PWA first open of the day, background call GET /api/summary/today. Idempotent — first call generates, subsequent calls hit cache.  
* User can invoke from chat: "看今天的简报".  
* No automatic scheduled generation.  
## v2 (P2) — Automatic:  
* Android collector triggers POST /api/summary/generate at 23:00 local.  
* Or PWA last-open-of-day triggers generation.  
## Rationale for not auto in v1: avoid re-introducing cron dependencies. Let the owner see what the summary looks like before automating.  
##   
## A.8 Acceptance Criteria  
* □ summaries table created  
* □ POST /api/summary/generate creates today's record  
* □ Re-running does not create duplicates (upsert idempotent)  
* □ GET /api/summary/today generates on miss, hits cache on hit  
* □ Data correctly includes wake / sleep / water / steps / reminders / top_apps  
* □ Empty day produces a record with nulls and zeros  
* □ Cross-day boundary correct: 23:59 local belongs to yesterday; 00:01 belongs to today  
* □ Timezone correct for Asia/Shanghai → UTC cutoff at 16:00 of previous day  
* □ Chat "看今天的简报" returns a formatted summary  
* □ All counts honor AGENTS.md §5.4 (daily scoping)  
##   
## A.9 Relationship to Existing Work  
##   
##   

| Existing | Relationship |
| --------------------------- | ---------------------------------------------------------------- |
| GET /api/summary (v1) | Deprecate. Replace with /api/summary/today. |
| activity_logs table | Not used directly. Summary reads signals rows already processed. |
| reminders table | Read directly. Counts shown / acted. |
| P1-09 (collector reminders) | Collector writes to reminders → summary reads. |
| P2 pattern engine | Depends on: summaries running stably for 2 weeks. |
  
## A.10 Out of Scope  
* Visualization  
* Trend comparison  
* Recommendations  
* Cross-day aggregation  
* Weekly / monthly reports  
* External BI tools  
* Automatic push  
##   
## A.11 TRACKING.md Entry  
```
markdown
### [P1-11] Daily summary v1

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: APPENDIX-A-daily-summary-v1.md
- **Description**: Aggregate the day's signals + reminders into one
  `summaries` row, feeding P2's pattern engine. v1 is aggregation only.
- **Acceptance**:
  - [ ] `summaries` table created
  - [ ] `POST /api/summary/generate` idempotent
  - [ ] `GET /api/summary/today` caches
  - [ ] Empty day generates
  - [ ] Cross-day boundary per user timezone
  - [ ] Chat "看今天的简报" works
- **Notes**: Depends on B-16 (water scoping) landing first.

```
##   
**End of Appendix A**  
#   
# Appendix B — Bug Fix Plan: [B-16] Water Count Accumulates Across Days  
## Refs: AGENTS.md v1.2 §5.4, APPENDIX-A-daily-summary-v1.md Category: Bug Priority: P0 Blocks: P1-11 (daily summary)  
##   
## B.1 Problem  
## The PWA shows "water ×N" where N includes previous days' entries. The count should reset at the user's local midnight (Asia/Shanghai).  
## Observed: Water count grows unbounded. Expected: Water count reflects only today (user's timezone).  
##   
## B.2 Root Cause  
## Three independent defects, all timezone-related:  
1. **Server-side "today" uses UTC.** new Date().setHours(0,0,0,0) on Vercel resolves to UTC midnight. For a user in Asia/Shanghai, this is 08:00 the same day — so the window starts 8 hours late.  
2. **Server-side queries lack an upper bound.** GET /api/signal filters created_at >= startOfDay but never caps with an upper bound. Any future-dated or cross-day rows leak in.  
3. **Client-side comparison uses browser timezone.** page.tsx calls new Date(s.created_at).toDateString(). This is browser-local, which on a phone set to Asia/Shanghai happens to match the user — but the underlying data is not scoped by the server, so the client filter is masking, not fixing, the problem.  
## Fix: apply the day-range utility (Appendix A §A.3) server-side, and remove the client-side re-filtering.  
##   
## B.3 Affected Files  
##   
##   

| File                     | Change                                           |
| ------------------------ | ------------------------------------------------ |
| lib/timezone.ts          | NEW — day range utilities (from Appendix A §A.3) |
| app/api/signal/route.ts  | GET: use getTodayRange, add upper bound          |
| app/api/summary/route.ts | Full rewrite to use day range, or deprecate      |
| app/api/steps/route.ts   | GET: use getTodayRange                           |
| app/api/chat/route.ts    | Today's-signals query: use day range             |
| app/page.tsx             | Remove client-side toDateString() comparison     |
| lib/yuanying.ts          | No change if signals passed in pre-fetched       |
  
****No database migration required. No schema change. Config already has ****timezone = "Asia/Shanghai"****.****  
##   
## B.4 Config Verification  
## Before deploying the fix, confirm the config row exists in production:  
```
sql
select * from config where key = 'timezone';
-- Expected: value = "Asia/Shanghai"

```
## If missing:  
```
sql
insert into config (key, value) values ('timezone', '"Asia/Shanghai"'::jsonb)
on conflict (key) do nothing;

```
##   
## B.5 Code Diffs  
## B.5.1 NEW — lib/timezone.ts  
## Copy verbatim from APPENDIX-A-daily-summary-v1.md §A.3.  
## B.5.2 app/api/signal/route.ts  
## Before:  
```
typescript
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');

    let startOfDay: Date;
    if (dateParam) {
      startOfDay = new Date(dateParam);
      startOfDay.setHours(0, 0, 0, 0);
    } else {
      startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
    }

    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .gte('created_at', startOfDay.toISOString())
      .lt('created_at', endOfDay.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ signals: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

```
## After:  
```
typescript
import { getDayRange, getTodayRange, getConfigTimezone } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const tz = await getConfigTimezone();

    const { start, end } = dateParam
      ? getDayRange(dateParam, tz)
      : getTodayRange(tz);

    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ signals: data ?? [] });
  } catch (err) {
    console.error('signal GET error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

```
## B.5.3 app/api/chat/route.ts  
## Before:  
```
typescript
const startOfDay = new Date();
startOfDay.setHours(0, 0, 0, 0);

const { data: todaysSignals } = await supabase
  .from('signals')
  .select('name, created_at')
  .gte('created_at', startOfDay.toISOString())
  .order('created_at', { ascending: true });

```
## After:  
```
typescript
import { getTodayRange, getConfigTimezone } from '@/lib/timezone';

const tz = await getConfigTimezone();
const { start, end } = getTodayRange(tz);

const { data: todaysSignals } = await supabase
  .from('signals')
  .select('name, created_at')
  .gte('created_at', start.toISOString())
  .lt('created_at', end.toISOString())
  .order('created_at', { ascending: true });

```
## B.5.4 app/api/summary/route.ts  
## This endpoint is deprecated by Appendix A §A.5.3. Two options:  
## Option 1 (recommended) — delete it. /api/summary/today replaces it.  
## Option 2 — keep it as a thin alias:  
```
typescript
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getTodayRange, getConfigTimezone } from '@/lib/timezone';

export const runtime = 'nodejs';

export async function GET() {
  const tz = await getConfigTimezone();
  const { start, end } = getTodayRange(tz);

  const { data } = await supabase
    .from('signals')
    .select('name, created_at')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  const signals = data ?? [];
  return NextResponse.json({
    date: getTodayRange(tz).date,
    wake: signals.find(s => s.name === 'wake')?.created_at ?? null,
    sleep: signals.find(s => s.name === 'sleep')?.created_at ?? null,
    water_count: signals.filter(s => s.name === 'water').length,
    signals_total: signals.length,
  });
}

```
## Choose one. Do not keep both.  
## B.5.5 app/api/steps/route.ts  
## Before:  
```
typescript
export async function GET() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('signals')
    .select('value, created_at')
    .eq('name', 'steps')
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  // ...
}

```
## After:  
```
typescript
import { getTodayRange, getConfigTimezone } from '@/lib/timezone';

export async function GET() {
  const tz = await getConfigTimezone();
  const { start, end } = getTodayRange(tz);

  const { data } = await supabase
    .from('signals')
    .select('value, created_at')
    .eq('name', 'steps')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  // ...
}

```
## B.5.6 app/page.tsx  
## Before:  
```
typescript
function isLogged(name: string): boolean {
  const today = new Date().toDateString();
  return todaySignals.some(
    s => s.name === name && new Date(s.created_at).toDateString() === today
  );
}

function getCount(name: string): number {
  const today = new Date().toDateString();
  return todaySignals.filter(
    s => s.name === name && new Date(s.created_at).toDateString() === today
  ).length;
}

```
## After:  
```
typescript
// todaySignals is already scoped server-side (see /api/signal GET).
// Do not re-filter on the client — the client's timezone may differ.
function isLogged(name: string): boolean {
  return todaySignals.some(s => s.name === name);
}

function getCount(name: string): number {
  return todaySignals.filter(s => s.name === name).length;
}

```
## Rationale: The client-side filter was masking the server bug. Removing it forces the server to be the single source of truth for "today."  
## B.5.7 lib/yuanying.ts  
## No change needed if buildSystemPrompt receives pre-fetched signals (from app/api/chat/route.ts, already fixed in B.5.3). Verify that buildSystemPrompt does not perform its own "today" computation.  
## Check:  
```
bash
grep -n "setHours\|toDateString\|startOfDay" lib/yuanying.ts

```
## Expected: no matches. If matches exist, remove them.  
##   
## B.6 Verification Steps  
## B.6.1 Unit test — day boundary  
```
typescript
import { getDayRange } from '@/lib/timezone';

test('Asia/Shanghai day range crosses UTC boundary correctly', () => {
  const range = getDayRange('2026-10-14', 'Asia/Shanghai');
  expect(range.start.toISOString()).toBe('2026-10-13T16:00:00.000Z');
  expect(range.end.toISOString()).toBe('2026-10-14T16:00:00.000Z');
});

```
## B.6.2 Integration test — cross-day  
1. Before local midnight (e.g., 23:50 Asia/Shanghai): tap water once.  
2. Confirm GET /api/signal returns water ×1.  
3. Wait for local midnight to pass.  
4. Call GET /api/signal again.  
5. **Pass**: water ×0 (today has no water yet).  
6. Confirm the previous day's water row still exists in Supabase (query without date filter, verify count).  
## B.6.3 Manual test — timezone edge  
**Set the test device timezone to **Asia/Shanghai** and to **UTC**. In both cases, "today" (per **GET /api/signal**) must match the user's local day, not the device's.**  
## If the device timezone differs from config.timezone, config.timezone wins. This is by design — the owner is a specific person in a specific timezone; the app should not depend on device settings.  
##   
## B.7 Acceptance Criteria  
* □ lib/timezone.ts exists with getTodayRange, getDayRange, getDateInTimezone  
* □ GET /api/signal uses getTodayRange and has upper bound  
* □ app/api/chat/route.ts uses getTodayRange and has upper bound  
* □ app/api/steps/route.ts uses getTodayRange  
* □ app/api/summary/route.ts deleted or refactored (choose one)  
* □ app/page.tsx no longer uses toDateString() in isLogged / getCount  
* □ No setHours(0,0,0,0) anywhere in app/ or lib/  
* □ Manual cross-day test passes  
* □ Unit test for day range passes  
* □ AGENTS.md §5.4 compliance verified by a second party  
* □ Owner runs it across a real midnight and confirms reset  
##   
## B.8 Regression Check  
## After deploying, verify:  
* □ Other signals (wake / sleep / steps) also scope correctly per day  
* □ Chat "今天喝水够了吗" returns today's count only  
* □ No change to POST /api/signal behavior (only GET is fixed)  
* □ Historical water rows remain in signals table (audit trail per AGENTS.md §3.5)  
##   
## B.9 What NOT to Do  
* Do not delete historical water rows  
* Do not backfill any previous day's counts  
* Do not change POST /api/signal (idempotency rules for wake/sleep are unaffected)  
* Do not "improve" the schema  
* Do not merge this fix with P1-09 / P1-10 / P1-11 PRs  
* Do not add features while fixing  
##   
## B.10 PR  
## Title: fix(signal): scope today's counts to user's local day  
## Body (template):  
```
text
Root cause: server-side "today" used UTC; client-side filter masked it.

Changes:
- lib/timezone.ts (new): getTodayRange / getDayRange / getDateInTimezone
- app/api/signal/route.ts: use getTodayRange, add upper bound
- app/api/chat/route.ts: same
- app/api/steps/route.ts: same
- app/api/summary/route.ts: deleted (replaced by /api/summary/today in P1-11)
- app/page.tsx: remove client-side toDateString() comparison

Verification:
- Unit test: day range crosses UTC at 16:00 (Asia/Shanghai)
- Manual: water count resets at local midnight
- Owner confirmed across a real midnight

Refs: AGENTS.md §5.4, APPENDIX-B-water-scoping-fix.md, TRACKING.md #B-16

```
##   
## B.11 TRACKING.md Entry  
```
markdown
### [B-16] water count accumulates across days

- **Status**: To Do
- **Owner**: —
- **Opened**: 2026-10-14
- **Phase**: P0
- **Category**: Bug
- **Refs**: AGENTS.md §5.4, APPENDIX-B-water-scoping-fix.md
- **Description**: Water count includes previous days' entries. Root cause
  is server-side "today" using UTC and client-side re-filtering using the
  browser timezone. Fix uses `getTodayRange(config.timezone)` everywhere.
- **Acceptance**:
  - [ ] `lib/timezone.ts` created
  - [ ] All "today" queries use `getTodayRange`
  - [ ] No `setHours(0,0,0,0)` in code
  - [ ] No `toDateString()` for "today" comparison
  - [ ] Water resets at local midnight
  - [ ] Historical rows retained
  - [ ] Owner confirmed across a real midnight
- **Blocks**: P1-11 (daily summary)
- **Notes**: No DB migration needed. Config `timezone` already correct.

```
##   
**End of Appendix B**  

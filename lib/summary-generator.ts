import { supabase } from './db';
import {
  getDayRange,
  getTodayRange,
  getConfigTimezone,
  getDateInTimezone,
  getDisplayDay,
  DayRange,
} from './timezone';
import { SummaryData } from './summary-types';

const WATER_TARGET_DEFAULT = 6;
const STEPS_GOAL_DEFAULT = 5000;
const TOP_APPS_LIMIT = 5;

async function loadConfig() {
  const { data } = await supabase.from('config').select('key, value');
  const config = Object.fromEntries(
    (data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])
  );
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

  // ES-007 §4: one action counter per habit.
  const habitOf = (s: any) => s.context?.habit ?? s.context?.reminder_name;
  const reminderActed = signals.filter((s: any) => s.name === 'reminder_acted');
  const standupActions = reminderActed.filter((s: any) => habitOf(s) === 'standup').length;
  const vitaminActed = reminderActed.find((s: any) => habitOf(s) === 'vitamin');

  const data: SummaryData = {
    wake: pickWake(signals),
    sleep: pickSleep(signals),
    water: {
      count: signals.filter((s: any) => s.name === 'water').length,
      target: WATER_TARGET_DEFAULT,
    },
    standup: { count: standupActions, target: 8 },
    vitamin: { done: !!vitaminActed, at: vitaminActed?.created_at ?? null },
    steps: {
      value: pickDailySteps(signals),
      goal: config.steps_goal,
    },
    apps_used: pickAppsUsed(signals),
    reminders: {
      water: countReminders(reminders, 'water'),
      standup: countReminders(reminders, 'standup'),
      vitamin: countReminders(reminders, 'vitamin'),
    },
    top_apps: pickTopApps(signals, TOP_APPS_LIMIT),
    notes: pickNotes(signals),
    signals_total: signals.length,
    generated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('summaries')
    .upsert(
      { date: range.date, timezone: tz, type: 'day', data },
      { onConflict: 'date,timezone,type' }
    );

  if (error) {
    throw new Error(`summary upsert failed: ${error.message}`);
  }

  return { date: range.date, timezone: tz, data };
}

type CachedSummary = {
  date: string;
  timezone: string;
  data: SummaryData;
  cached: boolean;
  updated_at?: string;
};

/** Read a day's summary; regenerate when stale (data or schema drift), else reuse. */
async function readOrGenerate(date: string, tz: string): Promise<CachedSummary> {
  const range = getDayRange(date, tz);
  const { data: existing } = await supabase
    .from('summaries')
    .select('*')
    .eq('date', date)
    .eq('timezone', tz)
    .eq('type', 'day')
    .maybeSingle();

  if (existing) {
    const latest = await latestDataAt(range.start, range.end);
    const writtenAt = new Date(existing.updated_at).getTime();
    const shapeOk =
      typeof (existing.data as { apps_used?: unknown })?.apps_used === 'number';
    if (latest <= writtenAt && shapeOk) {
      return {
        date,
        timezone: tz,
        data: existing.data as SummaryData,
        cached: true,
        updated_at: existing.updated_at,
      };
    }
  }

  const result = await generateSummary({ date, timezone: tz });
  return { ...result, cached: false };
}

export async function getTodaySummaryCached(): Promise<CachedSummary> {
  const tz = await getConfigTimezone();
  const date = getDateInTimezone(tz);
  return readOrGenerate(date, tz);
}

/**
 * ES-007 §1: the displayed summary + label reflect the last completed day.
 */
export async function getDisplaySummary(): Promise<CachedSummary & { label: string }> {
  const tz = await getConfigTimezone();
  const { date, label } = getDisplayDay(tz);
  const result = await readOrGenerate(date, tz);
  return { ...result, label };
}

/** Newest data timestamp within the day range (signals + reminders). */
async function latestDataAt(start: Date, end: Date): Promise<number> {
  const [sig, rem] = await Promise.all([
    supabase
      .from('signals')
      .select('created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('reminders')
      .select('scheduled_at, shown_at, acted_at, dismissed_at')
      .gte('scheduled_at', start.toISOString())
      .lt('scheduled_at', end.toISOString()),
  ]);

  let latest = 0;
  if (sig.data?.created_at) {
    latest = Math.max(latest, new Date(sig.data.created_at).getTime());
  }
  for (const r of (rem.data ?? []) as Array<Record<string, string | null>>) {
    for (const f of ['scheduled_at', 'shown_at', 'acted_at', 'dismissed_at']) {
      if (r[f]) latest = Math.max(latest, new Date(r[f] as string).getTime());
    }
  }
  return latest;
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

function pickDailySteps(signals: any[]): number {
  const steps = signals.filter(s => s.name === 'steps');
  if (steps.length === 0) return 0;
  // Steps are cumulative-within-day; take max snapshot, not last.
  return steps.reduce((max, s) => {
    const v = typeof s.value === 'number' ? s.value : 0;
    return Math.max(max, v);
  }, 0);
}

function countReminders(rows: any[], name: string) {
  const matching = rows.filter(r => r.name === name);
  return {
    shown: matching.filter(r => r.shown_at).length,
    acted: matching.filter(r => r.acted_at).length,
  };
}

function pickAppsUsed(signals: any[]): number {
  const pkgs = new Set<string>();
  for (const s of signals) {
    if (s.name !== 'app_usage') continue;
    const p = s.value?.package;
    if (p) pkgs.add(p);
  }
  return pkgs.size;
}

function pickNotes(signals: any[]) {
  const noteRows = signals.filter(s => s.name === 'note');
  return {
    count: noteRows.length,
    items: noteRows.slice(-10).map(s => ({
      at: s.created_at,
      text: truncateText(String(s.value?.text ?? ''), 200),
    })),
  };
}

function truncateText(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join('');
}

function pickTopApps(signals: any[], limit: number) {  const totals: Record<string, { name: string; minutes: number }> = {};
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

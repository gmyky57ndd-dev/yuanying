import { supabase } from './db';
import {
  getDayRange,
  getTodayRange,
  getConfigTimezone,
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

  const data: SummaryData = {
    wake: pickWake(signals),
    sleep: pickSleep(signals),
    water: {
      count: signals.filter((s: any) => s.name === 'water').length,
      target: WATER_TARGET_DEFAULT,
    },
    steps: {
      value: pickLatestStepsValue(signals),
      goal: config.steps_goal,
    },
    reminders: {
      water: countReminders(reminders, 'water'),
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

/** Read today's summary; generate (idempotent upsert) on miss. */
export async function getTodaySummaryCached(): Promise<{
  date: string;
  timezone: string;
  data: SummaryData;
  cached: boolean;
  updated_at?: string;
}> {
  const tz = await getConfigTimezone();
  const { date } = getTodayRange(tz);

  const { data: existing } = await supabase
    .from('summaries')
    .select('*')
    .eq('date', date)
    .eq('timezone', tz)
    .maybeSingle();

  if (existing) {
    return {
      date,
      timezone: tz,
      data: existing.data as SummaryData,
      cached: true,
      updated_at: existing.updated_at,
    };
  }

  const result = await generateSummary({ date, timezone: tz });
  return { ...result, cached: false };
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

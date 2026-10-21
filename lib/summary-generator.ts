import { supabase } from './db';
import fs from 'fs';
import path from 'path';
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

/**
 * ES-027 + ES-039: tone rules injected into the daily-summary prompt.
 * ES-039 makes the "no data list" rule explicit and requires notes first.
 */
export const SUMMARY_TONE_RULES = `- Focus on meaning. Do not just list technical bugs. Describe what the technical work means for the project or for the owner's state. "We verified three links" is a QA log; "We connected the nervous system today" is a summary.
- Use "we" or "I" (元婴), not only "you" (Owner). The day belongs to both of you.
- No empty menus. Do not ask the owner to choose what to summarize. Draft the summary yourself, then ask "Shall I save this?" (要我存下来吗？).

## 强制规则：每日总结 (Daily Summary)
- 必须以一两句“人话”开头，总结昨天的精神或生活状态。
- 数字（步数、水、睡眠时间）只能作为背景穿插在句子中，绝对不能使用带点号的列表（- 喝水：4/6）。
- 不给任何未经请求的健康建议（如“多喝水”、“早点睡”）。
- 先读 notes，notes 是主体；数字是背景。没有 notes 时也用句子说，不要改成数据清单。
- 语气：小悟式——冷静、有温度、不啰嗦。不要用表格、字段名或「Signals / Totals」标题。
- 例子："昨天你状态不错，做了不少园艺，还写了关于反馈链路的笔记。水喝得刚好，步数也达标了。"`;

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

  // ES-007 §4 + P1-41: one action counter per habit, counted from the habit
  // signal itself (manual tap or the reminder action button). No double count.
  const standupActions = signals.filter((s: any) => s.name === 'standup').length;
  const vitaminManual = signals.find((s: any) => s.name === 'vitamin');
  const vitaminDone = !!vitaminManual;

  const data: SummaryData = {
    wake: pickWake(signals),
    sleep: pickSleep(signals),
    water: {
      count: signals.filter((s: any) => s.name === 'water').length,
      target: WATER_TARGET_DEFAULT,
    },
    standup: { count: standupActions, target: 8 },
    vitamin: {
      done: vitaminDone,
      at: vitaminManual?.created_at ?? null,
    },
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
    conversations: pickConversations(range.date),
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
    .order('updated_at', { ascending: false })
    .limit(1)
    .eq('timezone', tz)
    .eq('type', 'day')
    .maybeSingle();

  if (existing) {
    const latest = await latestDataAt(range.start, range.end);
    const writtenAt = new Date(existing.updated_at).getTime();
    const shapeOk =
      typeof (existing.data as { apps_used?: unknown })?.apps_used ===
        'number' &&
      // ES-020: regenerate summaries written before `conversations` existed.
      Array.isArray((existing.data as { conversations?: unknown })?.conversations);
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
  // Clean-data cutoff (issue #8): prefer rows from the corrected aggregation
  // (`max_per_origin`, collector v1.0.27+), then local-window rows
  // (`context.timezone`, v1.0.21+), then legacy rows. Old `sum` rows (which
  // double-counted phone + Fit) are kept for audit but never override a
  // corrected reading.
  const byAgg = steps.filter((s: any) => s.context?.aggregation === 'max_per_origin');
  const byTz = steps.filter((s: any) => s.context?.timezone);
  const pool = byAgg.length > 0 ? byAgg : byTz.length > 0 ? byTz : steps;
  // Steps are cumulative-within-day; take max snapshot, not last (guards a
  // late empty sync writing 0).
  return pool.reduce((max, s) => {
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

/** Extract a `## Heading` section from a markdown file. */
function section(raw: string, heading: string): string | null {
  const m = raw.match(new RegExp(`^##\\s+${heading}\\s*$`, 'm'));
  if (!m || m.index == null) return null;
  const rest = raw.slice(m.index + m[0].length);
  const next = rest.search(/^##\s/m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

/**
 * ES-020: distilled AI-conversation records for the target day
 * (`core/memory/conversations/YYYY-MM-DD-*.md`). Prefer the Decisions
 * section; fall back to the file body.
 */
function pickConversations(date: string) {
  const dir = path.join(process.cwd(), 'core', 'memory', 'conversations');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.startsWith(`${date}-`) && f.endsWith('.md'))
    .sort()
    .map(f => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
      const title = (raw.match(/^#\s+(.+)$/m)?.[1] ?? f).replace(
        /^Conversation Record\s*—\s*/,
        ''
      );
      const body = section(raw, 'Decisions') ?? raw;
      return { file: f, title, excerpt: truncateText(body, 1200) };
    });
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

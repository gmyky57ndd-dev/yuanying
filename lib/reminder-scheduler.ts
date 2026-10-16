import { supabase } from './db';
import { ReminderConfig, ReminderName, UserContext } from './reminder-types';

const WATER_TARGET = 6;
const STANDUP_IDLE_MINUTES = 50;
const DAILY_CAP = 14; // ES-005 §E.2, raised 2026-10-16 for hourly standup + water + vitamin
const MISS_AFTER_MINUTES = 60;
const TZ = 'Asia/Shanghai';

// Serverless runs in UTC; all scheduling logic is anchored to Beijing time.
function beijingHourMinute(now: Date): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  const [h, m] = parts.split(':').map(n => parseInt(n, 10));
  return { h, m };
}

function startOfBeijingDay(now: Date): Date {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => p.find(x => x.type === t)!.value;
  return new Date(
    `${get('year')}-${get('month')}-${get('day')}T00:00:00+08:00`
  );
}

async function loadUserContext(): Promise<UserContext> {
  const now = new Date();
  const startOfDay = startOfBeijingDay(now);
  const fiftyMinAgo = new Date(now.getTime() - STANDUP_IDLE_MINUTES * 60 * 1000);

  const [todayRes, recentRes, configRes] = await Promise.all([
    supabase
      .from('signals')
      .select('name, created_at, context')
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('signals')
      .select('name, created_at')
      .gte('created_at', fiftyMinAgo.toISOString())
      .in('name', ['steps', 'app_usage']),
    supabase.from('config').select('*'),
  ]);

  const config = Object.fromEntries(
    (configRes.data ?? []).map((r: { key: string; value: unknown }) => [
      r.key,
      r.value,
    ])
  );

  return {
    now,
    todaySignals: todayRes.data ?? [],
    recentSignals: recentRes.data ?? [],
    config,
  };
}

function isInScheduleWindow(name: ReminderName, now: Date): boolean {
  const { h, m } = beijingHourMinute(now);

  switch (name) {
    case 'water':
      return (
        (h === 10 && m >= 30) ||
        (h === 15 && m >= 30) ||
        (h === 20 && m >= 0)
      );
    case 'standup':
      return h >= 9 && h < 18;
    case 'vitamin':
      return h === 8 && m >= 30;
  }
}

function parseHM(s: string): number {
  const [h, m] = s.split(':').map(n => parseInt(n, 10));
  return h * 60 + (m || 0);
}

function inQuietWindow(now: number, start: number, end: number): boolean {
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

/** Mark reminders missed when shown, not acted/dismissed, >60min (ES-005 §E.2). */
export async function sweepMissed(): Promise<number> {
  const cutoff = new Date(
    Date.now() - MISS_AFTER_MINUTES * 60 * 1000
  ).toISOString();
  const { data } = await supabase
    .from('reminders')
    .update({ missed_at: new Date().toISOString() })
    .is('acted_at', null)
    .is('dismissed_at', null)
    .is('missed_at', null)
    .not('shown_at', 'is', null)
    .lt('shown_at', cutoff)
    .select('id');
  return data?.length ?? 0;
}

async function hasRecentReminder(
  name: ReminderName,
  withinMinutes: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
  const { data } = await supabase
    .from('reminders')
    .select('id')
    .eq('name', name)
    .gte('scheduled_at', cutoff.toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

const REMINDERS: ReminderConfig[] = [
  {
    name: 'water',
    shouldFire: ctx => {
      const count = ctx.todaySignals.filter(s => s.name === 'water').length;
      return count < WATER_TARGET;
    },
    buildMessage: () => ({ message: '水。', voice_text: '该喝水了。' }),
  },
  {
    name: 'standup',
    shouldFire: ctx => ctx.recentSignals.length === 0,
    buildMessage: () => ({ message: '站。', voice_text: '站起来走走。' }),
  },
  {
    name: 'vitamin',
    shouldFire: ctx =>
      !ctx.todaySignals.some(
        s =>
          s.name === 'reminder_acted' &&
          s.context?.reminder_name === 'vitamin'
      ),
    buildMessage: () => ({ message: '维生素。', voice_text: '吃维生素了吗？' }),
  },
];

export async function fireDueReminders(
  filterName?: ReminderName
): Promise<{ fired: ReminderName[] }> {
  const ctx = await loadUserContext();
  const fired: ReminderName[] = [];

  // ES-005 §E.2: sweep misses first (shown, not acted, >60min).
  await sweepMissed();

  const enabled = ctx.config.reminders_enabled ?? {};

  // ES-005 §E.2: quiet window (config.timezone) — no fire, no backfill.
  const qw = ctx.config.quiet_window as
    | { start?: string; end?: string }
    | undefined;
  if (qw?.start && qw?.end) {
    const { h, m } = beijingHourMinute(ctx.now);
    if (inQuietWindow(h * 60 + m, parseHM(qw.start), parseHM(qw.end))) {
      return { fired };
    }
  }

  // ES-005 §E.2: daily cap across all habits.
  const startOfDay = startOfBeijingDay(ctx.now);
  const { count } = await supabase
    .from('reminders')
    .select('id', { count: 'exact', head: true })
    .gte('scheduled_at', startOfDay.toISOString());
  if ((count ?? 0) >= DAILY_CAP) {
    return { fired };
  }

  for (const config of REMINDERS) {
    if (filterName && config.name !== filterName) continue;
    if (enabled[config.name] === false) continue;
    if (!isInScheduleWindow(config.name, ctx.now)) continue;

    const should = await config.shouldFire(ctx);
    if (!should) continue;

    // ES-005 §E.2: standup at most every 120 min (was 60); others dedup 30.
    const dedupMin = config.name === 'standup' ? 120 : 30;
    const alreadyShown = await hasRecentReminder(config.name, dedupMin);
    if (alreadyShown) continue;

    const { message, voice_text } = config.buildMessage(ctx);

    const { error } = await supabase.from('reminders').insert({
      name: config.name,
      scheduled_at: ctx.now.toISOString(),
      context: { message, voice_text },
    });

    if (!error) fired.push(config.name);
  }

  return { fired };
}

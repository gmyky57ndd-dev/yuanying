import { supabase } from './db';
import { ReminderConfig, ReminderName, UserContext } from './reminder-types';

const WATER_TARGET = 6;
const STANDUP_IDLE_MINUTES = 50;
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

  const enabled = ctx.config.reminders_enabled ?? {};

  for (const config of REMINDERS) {
    if (filterName && config.name !== filterName) continue;
    if (enabled[config.name] === false) continue;
    if (!isInScheduleWindow(config.name, ctx.now)) continue;

    const should = await config.shouldFire(ctx);
    if (!should) continue;

    const alreadyShown = await hasRecentReminder(config.name, 30);
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

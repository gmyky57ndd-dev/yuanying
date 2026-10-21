import { supabase } from './db';
import { getConfigTimezone, getDateInTimezone } from './timezone';

const MAX_PENDING = 3;
const MAX_ACTION_CHARS = 200;

function offsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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

function zonedToUtc(date: string, time: string, tz: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offset = offsetMinutes(tz, anchor);
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60000
  );
}

function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + 86400000)
    .toISOString()
    .slice(0, 10);
}

export type ScheduleResult = {
  success: true;
  data: {
    scheduled_at: string;
    timezone: string;
    message: string;
  };
};

/** ES-046: limited one-shot reminder using the existing reminder poller. */
export async function scheduleMessage(
  time: string,
  action: string
): Promise<ScheduleResult> {
  const value = action.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('time must be HH:MM');
  }
  if (!value) throw new Error('action is required');
  if (Array.from(value).length > MAX_ACTION_CHARS) {
    throw new Error(`action too long (max ${MAX_ACTION_CHARS} characters)`);
  }

  const tz = await getConfigTimezone();
  const now = new Date();
  const today = getDateInTimezone(tz, now);
  let scheduled = zonedToUtc(today, time, tz);
  if (scheduled.getTime() <= now.getTime() + 30_000) {
    scheduled = zonedToUtc(nextDate(today), time, tz);
  }

  const nowIso = now.toISOString();
  const { count } = await supabase
    .from('reminders')
    .select('id', { count: 'exact', head: true })
    .eq('name', 'scheduled_message')
    .is('shown_at', null)
    .gte('scheduled_at', nowIso);

  if ((count ?? 0) >= MAX_PENDING) {
    throw new Error(`too many pending scheduled messages (max ${MAX_PENDING})`);
  }

  const { error } = await supabase.from('reminders').insert({
    name: 'scheduled_message',
    scheduled_at: scheduled.toISOString(),
    context: {
      message: value,
      voice_text: value,
      source: 'scheduler',
    },
  });
  if (error) throw new Error(`scheduling failed: ${error.message}`);

  return {
    success: true,
    data: {
      scheduled_at: scheduled.toISOString(),
      timezone: tz,
      message: value,
    },
  };
}

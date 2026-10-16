/**
 * Timezone utilities (AGENTS.md §6).
 *
 * All "today" queries use the user's configured timezone (`config.timezone`,
 * default Asia/Shanghai), not the server's (Vercel = UTC) and not the
 * browser's. Never use setHours(0,0,0,0) or toDateString() for product days.
 */

export interface DayRange {
  start: Date; // UTC instant equal to 00:00 in the given timezone
  end: Date; // UTC instant equal to next 00:00
  date: string; // "YYYY-MM-DD" in the given timezone
}

function getTimezoneOffsetMinutes(tz: string, at: Date): number {
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

export function getDateInTimezone(tz: string, at: Date = new Date()): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
 * ES-007 §1: the main summary reflects the most recently *completed* day.
 * Before 18:00 local → yesterday; 18:00–24:00 → today; after 00:00 → yesterday.
 */
export function getDisplayDay(
  tz: string,
  at: Date = new Date()
): { date: string; label: string } {
  const hStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  }).format(at);
  let h = parseInt(hStr, 10);
  if (h === 24) h = 0;
  const today = getDateInTimezone(tz, at);
  if (h >= 18) return { date: today, label: '今天' };
  const [y, m, d] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d) - 86400000)
    .toISOString()
    .slice(0, 10);
  return { date: yesterday, label: '昨天' };
}

/**
 * Read the user's timezone from config with a safe default.
 * Do not cache across requests — config may change.
 */
export async function getConfigTimezone(): Promise<string> {
  // Lazy import keeps this module's pure date helpers dependency-free
  // (importable in tests without resolving the Supabase client).
  const { supabase } = await import('./db');
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'timezone')
    .single();
  const tz = typeof data?.value === 'string' ? data.value : 'Asia/Shanghai';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    console.warn(`invalid timezone in config: ${tz}, falling back to Asia/Shanghai`);
    return 'Asia/Shanghai';
  }
}

import { supabase } from './db';
import { getConfigTimezone, getDateInTimezone } from './timezone';

const WATER_TARGET = 6;
const STEPS_GOAL = 5000;
const DIGEST_DAYS = 7;

function lastNDates(today: string, n: number): string[] {
  const [y, m, d] = today.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d, 12, 0, 0);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(base - i * 24 * 60 * 60 * 1000);
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * ES-005 §E.4: aggregate the last 7 daily summaries into prose. Not fields.
 * Stores the digest in `summaries` with type='week'.
 */
export async function generateWeeklyDigest(opts?: {
  timezone?: string;
}): Promise<{ week: string; prose: string }> {
  const tz = opts?.timezone ?? (await getConfigTimezone());
  const today = getDateInTimezone(tz);
  const days = lastNDates(today, DIGEST_DAYS);
  const week = days[0];

  const { data } = await supabase
    .from('summaries')
    .select('date, data')
    .eq('type', 'day')
    .eq('timezone', tz)
    .in('date', days);

  const rows = (data ?? []) as Array<{ date: string; data: any }>;

  const daysWithData = rows.filter(r => (r.data?.signals_total ?? 0) > 0).length;
  const daysWithout = DIGEST_DAYS - daysWithData;

  let lateAfter2330 = 0;
  let lateAfter0100 = 0;
  const waterCounts: number[] = [];
  const stepValues: number[] = [];
  let notesTotal = 0;

  for (const r of rows) {
    if (r.data?.sleep?.at) {
      const hm = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(r.data.sleep.at));
      const [hh, mm] = hm.split(':').map(Number);
      const mins = hh * 60 + mm;
      if (mins >= 23 * 60 + 30 || mins < 3 * 60) lateAfter2330++;
      if (mins >= 0 && mins < 2 * 60) lateAfter0100++;
    }
    if (typeof r.data?.water?.count === 'number') {
      waterCounts.push(r.data.water.count);
    }
    if (typeof r.data?.steps?.value === 'number') {
      stepValues.push(r.data.steps.value);
    }
    notesTotal += r.data?.notes?.count ?? 0;
  }

  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;
  const waterAvg = avg(waterCounts);
  const stepsAvg = Math.round(avg(stepValues));

  const lines: string[] = [];
  lines.push(`# Week of ${week}`);
  lines.push('');
  lines.push(`${daysWithData} 天有记录。${daysWithout} 天没有。`);
  lines.push('');
  lines.push(`睡眠：${lateAfter2330} 晚在 23:30 后睡。${lateAfter0100} 晚在 1:00 后。`);
  lines.push(`喝水：平均 ${waterAvg} / ${WATER_TARGET}。`);
  lines.push(`步数：平均 ${stepsAvg.toLocaleString()} / ${STEPS_GOAL.toLocaleString()}。`);
  lines.push(`笔记：${notesTotal} 条。`);
  if (daysWithData >= 3) {
    lines.push('');
    lines.push('有一条我注意到——但我先不说，等你问。');
  }

  const prose = lines.join('\n');

  await supabase.from('summaries').upsert(
    {
      date: week,
      timezone: tz,
      type: 'week',
      data: { text: prose, generated_at: new Date().toISOString() },
    },
    { onConflict: 'date,timezone,type' }
  );

  return { week, prose };
}

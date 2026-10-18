import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDateInTimezone } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DayAgg = {
  date: string;
  water: number;
  standup: number;
  steps: number;
  notes: number;
  chats: number;
  reminders: { shown: number; acted: number };
  signals: number;
};

/**
 * ES-008 §2.2: History day list, newest first. Cloud-first — computed on
 * demand from Supabase; nothing cached on the phone.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '60'), 1),
    365
  );

  const tz = await getConfigTimezone();
  const since = new Date(Date.now() - (limit + 1) * 86400000);

  const [sigRes, msgRes, remRes] = await Promise.all([
    supabase
      .from('signals')
      .select('name, value, created_at')
      .gte('created_at', since.toISOString()),
    supabase
      .from('messages')
      .select('role, created_at')
      .gte('created_at', since.toISOString()),
    supabase
      .from('reminders')
      .select('name, shown_at, acted_at, scheduled_at')
      .gte('scheduled_at', since.toISOString()),
  ]);

  if (sigRes.error || msgRes.error || remRes.error) {
    return NextResponse.json(
      { error: sigRes.error?.message ?? msgRes.error?.message ?? remRes.error?.message },
      { status: 500 }
    );
  }

  const days = new Map<string, DayAgg>();
  const dayOf = (iso: string) => getDateInTimezone(tz, new Date(iso));
  const ensure = (date: string): DayAgg => {
    let d = days.get(date);
    if (!d) {
      d = {
        date,
        water: 0,
        standup: 0,
        steps: 0,
        notes: 0,
        chats: 0,
        reminders: { shown: 0, acted: 0 },
        signals: 0,
      };
      days.set(date, d);
    }
    return d;
  };

  for (const s of sigRes.data ?? []) {
    const d = ensure(dayOf(s.created_at));
    d.signals += 1;
    if (s.name === 'water') d.water += 1;
    if (s.name === 'standup') d.standup += 1;
    if (s.name === 'note') d.notes += 1;
    if (s.name === 'steps') {
      const v = typeof s.value === 'number' ? s.value : 0;
      if (v > d.steps) d.steps = v; // cumulative-within-day → max snapshot
    }
  }

  for (const m of msgRes.data ?? []) {
    ensure(dayOf(m.created_at)).chats += 1;
  }

  for (const r of remRes.data ?? []) {
    const key = dayOf(r.scheduled_at);
    const d = ensure(key);
    if (r.shown_at) d.reminders.shown += 1;
    if (r.acted_at) d.reminders.acted += 1;
  }

  const list = Array.from(days.values())
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);

  return NextResponse.json({ timezone: tz, days: list });
}

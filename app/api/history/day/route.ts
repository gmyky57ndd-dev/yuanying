import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDayRange } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ES-008 §2.2: full detail for one product day — signals with timestamps,
 * notes, reminders fired + responses, that day's conversation, and the
 * stored prose summary (when present). Read-only.
 */
export async function GET(req: NextRequest) {
  const date = new URL(req.url).searchParams.get('date') ?? '';
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date=YYYY-MM-DD required' }, { status: 400 });
  }

  const tz = await getConfigTimezone();
  const { start, end } = getDayRange(date, tz);

  const [sigRes, remRes, msgRes, sumRes] = await Promise.all([
    supabase
      .from('signals')
      .select('id, name, value, context, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true }),
    supabase
      .from('reminders')
      .select('id, name, scheduled_at, shown_at, acted_at, dismissed_at, missed_at')
      .gte('scheduled_at', start.toISOString())
      .lt('scheduled_at', end.toISOString())
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('messages')
      .select('role, content, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true }),
    supabase
      .from('summaries')
      .select('data, updated_at, type')
      .eq('date', date)
      .eq('timezone', tz)
      .eq('type', 'day')
      .maybeSingle(),
  ]);

  const signals = sigRes.data ?? [];
  const notes = signals
    .filter((s: any) => s.name === 'note')
    .map((s: any) => ({ id: s.id, text: s.value?.text ?? '', at: s.created_at }));

  return NextResponse.json({
    date,
    timezone: tz,
    signals,
    notes,
    reminders: remRes.data ?? [],
    messages: msgRes.data ?? [],
    summary: sumRes.data?.data ?? null,
    updated_at: sumRes.data?.updated_at ?? null,
  });
}

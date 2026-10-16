import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getTodayRange, getConfigTimezone } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      window_start,
      window_end,
      steps,
      platform,
      sources,
      aggregation,
      timezone,
    } = body ?? {};

    if (typeof steps !== 'number' || steps < 0 || steps > 200000) {
      return NextResponse.json({ error: 'invalid steps' }, { status: 400 });
    }
    if (!window_start || !window_end) {
      return NextResponse.json({ error: 'invalid window' }, { status: 400 });
    }

    // P1-23 diagnostic: persist the window, per-source counts and the
    // aggregation mode alongside the total. `value` is unchanged.
    const { error } = await supabase.from('signals').insert({
      name: 'steps',
      type: 'count',
      value: steps,
      source: 'passive',
      context: {
        window_start,
        window_end,
        platform: platform ?? 'android',
        timezone: timezone ?? null,
        aggregation: aggregation ?? null,
        sources: Array.isArray(sources) ? sources : null,
        sources_count: Array.isArray(sources) ? sources.length : null,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('steps POST error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function GET() {
  // "Today" anchored to the user's configured timezone (AGENTS.md §6).
  const tz = await getConfigTimezone();
  const { start, end } = getTodayRange(tz);

  const { data } = await supabase
    .from('signals')
    .select('value, context, created_at')
    .eq('name', 'steps')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false });

  // P1-23: steps are cumulative-within-day; take the max snapshot, not the
  // last, so a late empty HealthConnect sync (value 0) does not erase a real
  // value. Prefer rows from the corrected local-midnight window (collector
  // v1.0.21+ tags context.timezone); legacy UTC-window rows are kept for audit
  // but excluded once a corrected row exists (clean-data cutoff).
  const rows = data ?? [];
  const corrected = rows.filter((r: any) => r.context?.timezone);
  const pool = corrected.length > 0 ? corrected : rows;
  const steps = pool.reduce(
    (max: number, r: any) => Math.max(max, Number(r.value) || 0),
    0
  );
  const latest = pool[0];

  const { data: goalConfig } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'steps_goal')
    .maybeSingle();

  return NextResponse.json({
    steps,
    goal: goalConfig?.value ?? 5000,
    updated_at: latest?.created_at ?? null,
  });
}

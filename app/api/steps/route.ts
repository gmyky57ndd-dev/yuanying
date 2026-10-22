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
      source,
      raw_value,
      partial,
      error: readError,
    } = body ?? {};

    if (typeof steps !== 'number' || steps < 0 || steps > 200000) {
      return NextResponse.json({ error: 'invalid steps' }, { status: 400 });
    }
    if (!window_start || !window_end) {
      return NextResponse.json({ error: 'invalid window' }, { status: 400 });
    }

    // Issue #68: a payload with zero HealthConnect origins carries no
    // information (a second device with no permission writes 0 every few
    // minutes and used to become the "latest" row). Accept but do not store it.
    const originCount = Array.isArray(sources) ? sources.length : null;
    if (steps === 0 && originCount === 0) {
      return NextResponse.json({ ok: true, skipped: 'no_origins' });
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
        // ES-011 §3 provenance
        source: source ?? null,
        aggregation: aggregation ?? null,
        raw_value: typeof raw_value === 'number' ? raw_value : null,
        sources: Array.isArray(sources) ? sources : null,
        sources_count: Array.isArray(sources) ? sources.length : null,
        // ES-073: a read that hit a HealthConnect permission error is partial
        // data, never a trustworthy "today" total.
        partial: partial === true,
        error: typeof readError === 'string' ? readError.slice(0, 300) : null,
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

  // P1-23 / issue #8: steps are cumulative-within-day; take the max snapshot,
  // not the last, so a late empty sync (0) does not erase a real value. Prefer
  // the corrected aggregation (`max_per_origin`, collector v1.0.27+), then
  // local-window rows (`context.timezone`), then legacy rows — old `sum` rows
  // (double-counted phone + Fit) never override a corrected reading.
  const rows = data ?? [];
  const byAgg = rows.filter((r: any) => r.context?.aggregation === 'max_per_origin');
  const byTz = rows.filter((r: any) => r.context?.timezone);
  const pool = byAgg.length > 0 ? byAgg : byTz.length > 0 ? byTz : rows;
  // ES-064 / #73: a permission-denied read is partial data; never show it as
  // today's total.
  const clean = pool.filter((r: any) => r.context?.partial !== true);
  const usable = clean.length > 0 ? clean : pool.filter((r: any) => r.context?.partial !== true);
  const best = usable.reduce(
    (a: any, b: any) =>
      (Number(b.value) || 0) > (Number(a.value) || 0) ? b : a,
    usable[0]
  );
  const steps = Number(best?.value) || 0;
  const ctx = best?.context ?? {};

  const { data: goalConfig } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'steps_goal')
    .maybeSingle();

  return NextResponse.json({
    steps,
    goal: goalConfig?.value ?? 5000,
    updated_at: best?.created_at ?? null,
    // Issue #68: when the last sync happened, even if it carried no new value.
    last_sync_at: rows[0]?.created_at ?? null,
    // ES-064: true when the newest sync was a permission-denied partial read.
    partial_read: rows[0]?.context?.partial === true,
    // ES-025: expose the source breakdown behind the displayed value.
    source: ctx.source ?? null,
    aggregation: ctx.aggregation ?? null,
    raw_value: typeof ctx.raw_value === 'number' ? ctx.raw_value : null,
    sources: Array.isArray(ctx.sources) ? ctx.sources : [],
    sources_count:
      typeof ctx.sources_count === 'number'
        ? ctx.sources_count
        : Array.isArray(ctx.sources)
          ? ctx.sources.length
          : 0,
    window_start: ctx.window_start ?? null,
    window_end: ctx.window_end ?? null,
    timezone: ctx.timezone ?? null,
  });
}

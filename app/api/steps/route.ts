import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { window_start, window_end, steps, platform } = body ?? {};

    if (typeof steps !== 'number' || steps < 0 || steps > 200000) {
      return NextResponse.json({ error: 'invalid steps' }, { status: 400 });
    }
    if (!window_start || !window_end) {
      return NextResponse.json({ error: 'invalid window' }, { status: 400 });
    }

    const { error } = await supabase.from('signals').insert({
      name: 'steps',
      type: 'count',
      value: steps,
      source: 'passive',
      context: { window_start, window_end, platform: platform ?? 'android' },
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
  // "Today" anchored to Beijing time.
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find(x => x.type === t)!.value;
  const startOfDay = new Date(
    `${get('year')}-${get('month')}-${get('day')}T00:00:00+08:00`
  );

  const { data } = await supabase
    .from('signals')
    .select('value, created_at')
    .eq('name', 'steps')
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  const latest = data?.[0];

  const { data: goalConfig } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'steps_goal')
    .maybeSingle();

  return NextResponse.json({
    steps: latest?.value ?? 0,
    goal: goalConfig?.value ?? 5000,
    updated_at: latest?.created_at ?? null,
  });
}

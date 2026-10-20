import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getDayRange, getTodayRange, getConfigTimezone } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_NAMES = ['wake', 'sleep', 'water', 'standup', 'vitamin', 'brief_wake', 'manual_work', 'body_flag'] as const;
const COUNT_NAMES: readonly string[] = ['water', 'standup', 'manual_work'];
const IDEMPOTENT: readonly string[] = ['wake', 'sleep'];
const SOURCES: readonly string[] = ['manual', 'reminder', 'passive'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, value, note, context, source } = body ?? {};
    const src = SOURCES.includes(source) ? source : 'manual';

    if (!VALID_NAMES.includes(name)) {
      return NextResponse.json(
        { error: `invalid name: ${name}` },
        { status: 400 }
      );
    }

    if (name === 'manual_work') {
      const category = String(context?.category ?? '').trim();
      if (!['园艺', '做饭', '家务', '修理'].includes(category)) {
        return NextResponse.json(
          { error: 'manual_work requires category: 园艺|做饭|家务|修理' },
          { status: 400 }
        );
      }
    }

    if (name === 'body_flag') {
      const domain = String(value?.domain ?? '').trim();
      const polarity = String(value?.polarity ?? '').trim();
      const description = String(value?.description ?? '').trim();
      if (!['身体', '情绪', '睡眠'].includes(domain)) {
        return NextResponse.json(
          { error: 'body_flag requires domain: 身体|情绪|睡眠' },
          { status: 400 }
        );
      }
      if (!['不适', '良好'].includes(polarity)) {
        return NextResponse.json(
          { error: 'body_flag requires polarity: 不适|良好' },
          { status: 400 }
        );
      }
      if (!description) {
        return NextResponse.json(
          { error: 'body_flag requires description' },
          { status: 400 }
        );
      }
    }

    // 幂等检查：wake/sleep 当日不重复（按用户本地日）
    if (IDEMPOTENT.includes(name)) {
      const tz = await getConfigTimezone();
      const { start } = getTodayRange(tz);

      const { data: existing } = await supabase
        .from('signals')
        .select('id')
        .eq('name', name)
        .gte('created_at', start.toISOString())
        .limit(1)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ ok: true, id: existing.id, deduped: true });
      }
    }

    const { data, error } = await supabase
      .from('signals')
      .insert({
        name,
        type: COUNT_NAMES.includes(name) ? 'count' : 'event',
        value: value ?? (COUNT_NAMES.includes(name) ? 1 : true),
        note: note ?? null,
        source: src,
        context: context ?? {},
      })
      .select('id')
      .single();
    if (error) {
      console.error('signal insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('signal route error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const tz = await getConfigTimezone();

    const { start, end } = dateParam
      ? getDayRange(dateParam, tz)
      : getTodayRange(tz);

    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ signals: data ?? [] });
  } catch (err) {
    console.error('signal GET error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

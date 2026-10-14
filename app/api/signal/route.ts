import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_NAMES = ['wake', 'sleep', 'water'] as const;
const IDEMPOTENT: readonly string[] = ['wake', 'sleep'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, value, note, context } = body ?? {};

    if (!VALID_NAMES.includes(name)) {
      return NextResponse.json(
        { error: `invalid name: ${name}` },
        { status: 400 }
      );
    }

    // 幂等检查：wake/sleep/sit 当日不重复
    if (IDEMPOTENT.includes(name)) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: existing } = await supabase
        .from('signals')
        .select('id')
        .eq('name', name)
        .gte('created_at', startOfDay.toISOString())
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
        type: name === 'water' ? 'count' : 'event',
        value: value ?? (name === 'water' ? 1 : true),
        note: note ?? null,
        source: 'manual',
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

    let startOfDay: Date;
    if (dateParam) {
      startOfDay = new Date(dateParam);
    } else {
      startOfDay = new Date();
    }
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .gte('created_at', startOfDay.toISOString())
      .lt('created_at', endOfDay.toISOString())
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

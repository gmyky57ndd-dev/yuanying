import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getTodayRange, getConfigTimezone } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LEN = 2000;

/** Today's notes (read-only list), scoped to the product day. */
export async function GET() {
  const tz = await getConfigTimezone();
  const { start, end } = getTodayRange(tz);

  const { data, error } = await supabase
    .from('signals')
    .select('id, value, context, created_at')
    .eq('name', 'note')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notes = (data ?? []).map((r: any) => ({
    id: r.id,
    text: r.value?.text ?? '',
    input: r.context?.input ?? 'text',
    at: r.created_at,
  }));

  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  try {
    const { text, input } = await req.json();

    if (typeof text !== 'string') {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ error: 'empty note' }, { status: 400 });
    }
    if (trimmed.length > MAX_LEN) {
      return NextResponse.json(
        { error: `note too long (max ${MAX_LEN})` },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('signals').insert({
      name: 'note',
      type: 'note',
      value: { text: trimmed },
      source: 'manual',
      context: { input: input === 'voice' ? 'voice' : 'text' },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    // Do not log note content.
    console.error('note POST error');
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

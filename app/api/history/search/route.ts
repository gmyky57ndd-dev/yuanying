import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDateInTimezone } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ES-008 §2.2: search. A date query jumps to that day; otherwise search note
 * text by keyword. No user-facing tags — notes are found by their own words.
 */
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) {
    return NextResponse.json({ type: 'empty', notes: [] });
  }

  if (DATE_RE.test(q)) {
    return NextResponse.json({ type: 'date', date: q });
  }

  // Strip PostgREST-significant characters from the pattern.
  const pattern = `%${q.replace(/[%,]/g, '')}%`;
  const tz = await getConfigTimezone();

  const { data, error } = await supabase
    .from('signals')
    .select('id, value, created_at')
    .eq('name', 'note')
    .filter('value->>text', 'ilike', pattern)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notes = (data ?? []).map((r: any) => ({
    id: r.id,
    text: r.value?.text ?? '',
    at: r.created_at,
    date: getDateInTimezone(tz, new Date(r.created_at)),
  }));

  return NextResponse.json({ type: 'notes', notes });
}

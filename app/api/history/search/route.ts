import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDateInTimezone } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ES-008 §2.2 + ES-012 §2: search. A date query jumps to that day; otherwise
 * search note text and note tags by keyword (tags are searchable — ES-012).
 */
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) {
    return NextResponse.json({ type: 'empty', notes: [] });
  }

  if (DATE_RE.test(q)) {
    return NextResponse.json({ type: 'date', date: q });
  }

  const tz = await getConfigTimezone();
  const needle = q.toLowerCase();

  // Single-user scale: fetch recent notes and match text or tags in memory
  // (robust across the jsonb tags array; avoids brittle PostgREST operators).
  const { data, error } = await supabase
    .from('signals')
    .select('id, value, created_at')
    .eq('name', 'note')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notes = (data ?? [])
    .filter((r: any) => {
      const text = String(r.value?.text ?? '').toLowerCase();
      const tags: string[] = Array.isArray(r.value?.tags) ? r.value.tags : [];
      return (
        text.includes(needle) ||
        tags.some((t: string) => String(t).toLowerCase().includes(needle))
      );
    })
    .slice(0, 100)
    .map((r: any) => ({
      id: r.id,
      text: r.value?.text ?? '',
      tags: Array.isArray(r.value?.tags) ? r.value.tags : [],
      at: r.created_at,
      date: getDateInTimezone(tz, new Date(r.created_at)),
    }));

  return NextResponse.json({ type: 'notes', notes });
}

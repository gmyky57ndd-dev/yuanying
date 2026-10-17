import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDateInTimezone } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ES-012 §3: Feedback Inbox — notes the owner flagged (or accepted the
 * proposed flag) as feedback. Pre-PM staging; one-way owner → dev.
 */
export async function GET() {
  const tz = await getConfigTimezone();
  const { data, error } = await supabase
    .from('signals')
    .select('id, value, context, feedback_status, created_at')
    .eq('name', 'note')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? [])
    .filter((r: any) => r.value?.feedback === true)
    .map((r: any) => ({
      id: r.id,
      text: r.value?.text ?? '',
      tags: Array.isArray(r.value?.tags) ? r.value.tags : [],
      promoted: r.value?.promoted === true,
      status: r.feedback_status ?? 'new',
      issue_url: r.context?.github_issue_url ?? null,
      date: getDateInTimezone(tz, new Date(r.created_at)),
      at: r.created_at,
    }));

  return NextResponse.json({ items });
}

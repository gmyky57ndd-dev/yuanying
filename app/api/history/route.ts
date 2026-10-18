import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getTodayRange } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Conversation log. `?today=1` scopes to the current product day (ES-009 §1:
 * the home chat never scrolls back past 00:00 local).
 *
 * Returns the **newest** `limit` messages, in chronological order. (Ordering
 * ascending + limit returns the *oldest* N, which silently dropped the newest
 * messages once a day exceeded the limit — issue #11.)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '50'), 1),
    500
  );
  const todayOnly = url.searchParams.get('today') === '1';

  let query = supabase
    .from('messages')
    .select(
      'id, role, content, created_at, github_issue_url, github_issue_number, metadata'
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (todayOnly) {
    const tz = await getConfigTimezone();
    const { start, end } = getTodayRange(tz);
    query = query
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Newest-first from the query; reverse to chronological for the UI.
  const rows = (data ?? []).slice().reverse();
  return NextResponse.json({
    messages: rows.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      github_issue_url: m.github_issue_url ?? null,
      github_issue_number: m.github_issue_number ?? null,
      inbox_path: m.metadata?.inbox_path ?? null,
    })),
  });
}

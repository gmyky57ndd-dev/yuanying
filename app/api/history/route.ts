import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getTodayRange } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Conversation log. `?today=1` scopes to the current product day (ES-009 §1:
 * the home chat never scrolls back past 00:00 local).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') ?? '50'),
    200
  );
  const todayOnly = url.searchParams.get('today') === '1';

  let query = supabase
    .from('messages')
    .select('role, content, created_at')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);

  if (todayOnly) {
    const tz = await getConfigTimezone();
    const { start } = getTodayRange(tz);
    query = query.gte('created_at', start.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    messages: (data ?? []).map(m => ({ role: m.role, content: m.content })),
  });
}

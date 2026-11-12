import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getTodayRange } from '@/lib/timezone';
import { localHistory, localConfig } from '@/lib/local-read';

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
  const projectId = url.searchParams.get('project_id')?.trim();
  const forceLocal = url.searchParams.get('local') === '1';

  if (forceLocal) {
    let tz = (localConfig().timezone as string) || 'America/Detroit';
    try {
      tz = await getConfigTimezone();
    } catch {
      // local only
    }
    return NextResponse.json({
      messages: localHistory({ limit, projectId, todayOnly, timezone: tz }),
      local: true,
    });
  }

  let query = supabase
    .from('messages')
    .select(
      'id, role, content, created_at, github_issue_url, github_issue_number, metadata, responder_fenshen_id'
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (projectId) query = query.eq('project_id', projectId);
  if (todayOnly) {
    const tz = await getConfigTimezone();
    const { start, end } = getTodayRange(tz);
    query = query
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    // Phase 2: Supabase unreachable → serve the local mirror.
    console.warn('history: falling back to local SQLite', error.message);
    let tz = 'America/Detroit';
    try {
      tz = await getConfigTimezone();
    } catch {
      tz = (localConfig().timezone as string) || tz;
    }
    const local = localHistory({
      limit,
      projectId,
      todayOnly,
      timezone: tz,
    });
    return NextResponse.json({ messages: local, local: true });
  }

  // Newest-first from the query; reverse to chronological for the UI.
  const rows = (data ?? []).slice().reverse();
  return NextResponse.json({
    messages: rows.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      github_issue_url: m.github_issue_url ?? null,
      github_issue_number: m.github_issue_number ?? null,
      inbox_path: m.metadata?.inbox_path ?? null,
      responder_fenshen_id: m.responder_fenshen_id ?? null,
      truncated: m.metadata?.truncated === true,
    })),
  });
}

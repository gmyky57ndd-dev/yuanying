import { supabase } from '@/lib/db';

export type SystemEvent = {
  id: number;
  ts: string;
  route: string;
  status: number;
  duration_ms: number | null;
  error: string | null;
  meta: Record<string, unknown> | null;
};

/**
 * ES-061: operational events, never message content. Best-effort: a failure to
 * log must never break the request that is being logged.
 */
export async function recordSystemEvent(event: {
  route: string;
  status: number;
  duration_ms?: number | null;
  error?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await supabase.from('system_events').insert({
      route: event.route,
      status: event.status,
      duration_ms: event.duration_ms ?? null,
      error: event.error ? String(event.error).slice(0, 500) : null,
      meta: event.meta ?? null,
    });
  } catch (e) {
    console.error('system event insert failed', e);
  }
}

export async function getRecentSystemEvents(limit = 5): Promise<SystemEvent[]> {
  const { data } = await supabase
    .from('system_events')
    .select('id, ts, route, status, duration_ms, error, meta')
    .order('ts', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 20));
  return (data ?? []) as SystemEvent[];
}

/** A short, human-readable diagnosis for the last failure, if any. */
export function describeEvent(e: SystemEvent): string {
  if (e.status === 200) return `${e.route} 正常（${e.duration_ms ?? '?'}ms）`;
  if (e.status === 504) return `${e.route} 网关超时（504，${e.duration_ms ?? '?'}ms）`;
  if (e.status === 401 || e.status === 403) return `${e.route} 认证失败（${e.status}）`;
  if (e.status >= 500) return `${e.route} 服务端错误（${e.status}）：${e.error ?? '未知'}`;
  return `${e.route} 返回 ${e.status}${e.error ? `：${e.error}` : ''}`;
}

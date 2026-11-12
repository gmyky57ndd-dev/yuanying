import { supabase } from '@/lib/db';
import type { SystemEvent } from './event-utils';
import { summarizeToolArgs } from './event-utils';

export type { SystemEvent } from './event-utils';
export { summarizeToolArgs, classifyStreamError, describeEvent } from './event-utils';

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


export async function recordToolEvent(event: {
  request_id: string;
  tool: string;
  args: Record<string, unknown> | null;
  duration_ms: number;
  ok: boolean;
  error?: string | null;
  error_type?: string | null;
  fenshen_id?: string | null;
  model?: string | null;
}): Promise<void> {
  await recordSystemEvent({
    route: '/api/chat/tool',
    status: event.ok ? 200 : 500,
    duration_ms: event.duration_ms,
    error: event.ok ? null : (event.error ?? 'tool failed'),
    meta: {
      kind: 'tool',
      request_id: event.request_id,
      tool: event.tool,
      args: summarizeToolArgs(event.args),
      ok: event.ok,
      error_type: event.ok ? null : (event.error_type ?? 'tool_error'),
      fenshen_id: event.fenshen_id ?? null,
      model: event.model ?? null,
    },
  });
}

export async function getRecentSystemEvents(limit = 5): Promise<SystemEvent[]> {
  const { data } = await supabase
    .from('system_events')
    .select('id, ts, route, status, duration_ms, error, meta')
    .order('ts', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  return (data ?? []) as SystemEvent[];
}

/** A short, human-readable diagnosis for one event. */

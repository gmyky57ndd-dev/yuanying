import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 55;

/**
 * ES-063 §2.2: realtime message delivery.
 *
 * Supabase Realtime would need a public anon key; this deployment only has the
 * service-role key, which must never reach the browser. This SSE channel gives
 * the same semantics (INSERT stream + client-side dedupe by id/device) over the
 * existing cookie auth. Swapping it for `supabase.channel()` later is a
 * transport change, not an architecture change.
 *
 * Response: `event: message` + JSON `{id, role, content, created_at, device_id}`.
 * The client reconnects with `after=<last id>`; the stream lives 50 s.
 */
export async function GET(req: NextRequest) {
  const afterParam = Number(new URL(req.url).searchParams.get('after') ?? '0');
  let after = Number.isFinite(afterParam) && afterParam > 0 ? afterParam : 0;

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* client gone */
        }
      };

      send(': connected\n\n');
      let lastPing = Date.now();

      try {
        while (Date.now() - startedAt < 50_000) {
          const { data } = await supabase
            .from('messages')
            .select('id, role, content, created_at, device_id')
            .gt('id', after)
            .order('id', { ascending: true })
            .limit(50);

          for (const row of (data ?? []) as any[]) {
            after = Math.max(after, Number(row.id) || after);
            send(`event: message\ndata: ${JSON.stringify(row)}\n\n`);
          }

          if (Date.now() - lastPing > 15_000) {
            send(': ping\n\n');
            lastPing = Date.now();
          }
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

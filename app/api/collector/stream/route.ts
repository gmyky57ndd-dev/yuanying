import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';
import { isBearerValid } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 55;

/**
 * ES-054: collector refresh channel.
 *
 * The stream does not keep an in-memory registry: Vercel may serve the chat
 * request that writes `collector_sync_requested_at` on another instance. It
 * polls that config key every 2 s and emits `event: sync` when it changes, so a
 * single collector connection is enough and no state has to be shared.
 *
 * Lifetime is 50 s (maxDuration 55); the collector reconnects.
 */
async function currentMarker(): Promise<string | null> {
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'collector_sync_requested_at')
    .maybeSingle();
  const value = (data as { value?: unknown } | null)?.value;
  return typeof value === 'string' ? value : null;
}

export async function GET(req: NextRequest) {
  const token = process.env.API_TOKEN || '';
  if (!isBearerValid(req.headers.get('authorization'), token)) {
    return new Response('unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  let baseline: string | null | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* client went away */
        }
      };

      send(': connected\n\n');
      let lastPing = Date.now();

      try {
        while (Date.now() - startedAt < 50_000) {
          const marker = await currentMarker();
          if (baseline === undefined) {
            baseline = marker;
          } else if (marker && marker !== baseline) {
            baseline = marker;
            send(`event: sync\ndata: ${marker}\n\n`);
          }
          if (Date.now() - lastPing > 15_000) {
            send(': ping\n\n');
            lastPing = Date.now();
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
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

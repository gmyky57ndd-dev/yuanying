import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDateInTimezone } from '@/lib/timezone';
import { generateEveningText } from '@/lib/evening-summary';
import { pushToActiveDevices } from '@/lib/push';
import { recordSystemEvent } from '@/lib/system-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ES-075 module A: the only server-side evening summary entry point.
 *
 * Guard: runs only between 21:00 and 22:00 local (force=1 bypasses, at=<ISO>
 * overrides the clock for tests). The date comes from the local clock so a
 * delayed GitHub job still closes the correct day.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const force = url.searchParams.get('force') === '1';
  const at = url.searchParams.get('at');
  const explicitDate = url.searchParams.get('date');
  const started = Date.now();

  try {
    const tz = await getConfigTimezone();
    const now = at ? new Date(at) : new Date();
    const localHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        hour12: false,
      }).format(now)
    );

    if (!force && (localHour < 21 || localHour >= 22)) {
      return NextResponse.json({
        ok: true,
        skipped: 'not_evening',
        local_hour: localHour,
        timezone: tz,
      });
    }

    const today = getDateInTimezone(tz);
    const date =
      explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)
        ? explicitDate
        : localHour < 12
          ? (() => {
              const y = new Date(`${today}T12:00:00Z`);
              y.setUTCDate(y.getUTCDate() - 1);
              return y.toISOString().slice(0, 10);
            })()
          : today;

    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .in('metadata->>type', ['evening_summary', 'daily_summary'])
      .filter('metadata->>date', 'eq', date)
      .limit(1)
      .maybeSingle();
    if (existing && !dry && !force) {
      return NextResponse.json({
        ok: true,
        skipped: 'already_generated',
        date,
        message_id: existing.id,
      });
    }

    const body = await generateEveningText(date, tz);
    if (dry) return NextResponse.json({ ok: true, dry: true, date, text: body });

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        role: 'assistant',
        content: body,
        session_id: null,
        device_id: null,
        metadata: { type: 'evening_summary', date, tz },
      })
      .select('id')
      .single();
    if (error) throw new Error(`insert failed: ${error.message}`);

    const push = await pushToActiveDevices({
      title: '元婴',
      body: body.length > 180 ? `${body.slice(0, 178)}…` : body,
      url: '/',
    });

    await recordSystemEvent({
      route: '/api/cron/evening-summary',
      status: 200,
      duration_ms: Date.now() - started,
      error: null,
      meta: { date, message_id: inserted?.id ?? null, push },
    });

    return NextResponse.json({ ok: true, date, message_id: inserted?.id, push });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'evening summary failed';
    await recordSystemEvent({
      route: '/api/cron/evening-summary',
      status: 500,
      duration_ms: Date.now() - started,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDayRange } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ES-075 module B: the collector writes one row per local reminder delivery.
 * 'failed' rows are mandatory when the notification could not be posted or the
 * slot was missed because the process was not running.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const habit = String(body?.habit ?? '').trim();
    const status = body?.status;
    const scheduledAt = String(body?.scheduled_at ?? '').trim();
    if (!habit) {
      return NextResponse.json({ error: 'habit required' }, { status: 400 });
    }
    if (status !== 'delivered' && status !== 'failed') {
      return NextResponse.json({ error: 'status must be delivered|failed' }, { status: 400 });
    }
    if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
      return NextResponse.json({ error: 'scheduled_at must be ISO' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('reminder_deliveries')
      .insert({
        habit,
        scheduled_at: scheduledAt,
        fired_at: body?.fired_at ? String(body.fired_at) : null,
        status,
        error_message:
          status === 'failed'
            ? String(body?.error_message ?? 'unknown error').slice(0, 300)
            : null,
        device_id: typeof body?.device_id === 'string' ? body.device_id.slice(0, 80) : null,
      })
      .select('id')
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid body' },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const tz = await getConfigTimezone();
  const { start, end } = date
    ? getDayRange(date, tz)
    : getDayRange(new Date().toISOString().slice(0, 10), tz);

  const { data } = await supabase
    .from('reminder_deliveries')
    .select('id, habit, scheduled_at, fired_at, status, error_message, device_id, created_at')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false });
  return NextResponse.json({ date: date ?? null, deliveries: data ?? [] });
}

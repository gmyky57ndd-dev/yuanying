import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

/**
 * ES-063 §2.3: presence heartbeat. Devices write every 60 s (and on visibility
 * change); notification routing reads the devices seen in the last 5 minutes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deviceId = String(body?.device_id ?? '').trim();
    if (!deviceId || deviceId.length > 80) {
      return NextResponse.json({ error: 'device_id required' }, { status: 400 });
    }
    const device =
      typeof body?.device === 'string' ? body.device.slice(0, 40) : null;
    const status = body?.status === 'idle' ? 'idle' : 'active';

    const { error } = await supabase.from('device_presence').upsert(
      {
        device_id: deviceId,
        device,
        status,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'device_id' }
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid body' },
      { status: 400 }
    );
  }
}

export async function GET() {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from('device_presence')
    .select('device_id, device, status, last_seen')
    .gte('last_seen', since)
    .order('last_seen', { ascending: false });

  return NextResponse.json({
    active_window_ms: ACTIVE_WINDOW_MS,
    devices: (data ?? []).map((d: any) => ({
      device_id: d.device_id,
      device: d.device,
      status: d.status,
      last_seen: d.last_seen,
    })),
  });
}

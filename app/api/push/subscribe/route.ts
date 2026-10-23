import { NextRequest, NextResponse } from 'next/server';
import { saveSubscription, removeSubscription } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ES-065: store a browser PushSubscription. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deviceId = String(body?.device_id ?? '').trim();
    const sub = body?.subscription;
    if (!deviceId || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json(
        { error: 'device_id and a full subscription are required' },
        { status: 400 }
      );
    }
    await saveSubscription({
      device_id: deviceId,
      endpoint: String(sub.endpoint),
      p256dh: String(sub.keys.p256dh),
      auth: String(sub.keys.auth),
      device: typeof body?.device === 'string' ? body.device.slice(0, 40) : null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid body' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const endpoint = new URL(req.url).searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
  }
  await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}

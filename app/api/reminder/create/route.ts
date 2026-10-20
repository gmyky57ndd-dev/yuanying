import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NAMES = ['water', 'standup', 'vitamin', 'evening_checkin'];

/**
 * Collector-side reminder creation (P1-09). The Android collector decides a
 * reminder is due, records it here (so the daily summary can count it), then
 * delivers the notification + TTS on-device. `shown` defaults to true because
 * the collector shows it immediately.
 */
export async function POST(req: NextRequest) {
  try {
    const { name, message, voice_text, shown } = await req.json();

    if (!NAMES.includes(name)) {
      return NextResponse.json({ error: 'invalid name' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('reminders')
      .insert({
        name,
        scheduled_at: nowIso,
        shown_at: shown === false ? null : nowIso,
        context: { message: message ?? '', voice_text: voice_text ?? '' },
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('reminder/create error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

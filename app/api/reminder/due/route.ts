import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { sweepMissed } from '@/lib/reminder-scheduler';
import { processPendingJobs } from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const nowIso = new Date().toISOString();

  // ES-005 §E.2: sweep misses (shown, not acted/dismissed, >60min).
  await sweepMissed();

  // ES-046: opportunistically process one queued tool job while the PWA polls.
  await processPendingJobs(1).catch(e =>
    console.warn('pending job processing failed', e)
  );

  const { data, error } = await supabase
    .from('reminders')
    .select('id, name, scheduled_at, context')
    .is('shown_at', null)
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reminders = (data ?? []).map(
    (r: { id: number; name: string; scheduled_at: string; context: any }) => ({
      id: r.id,
      name: r.name,
      message: r.context?.message ?? '',
      voice_text: r.context?.voice_text ?? '',
      scheduled_at: r.scheduled_at,
    })
  );

  // Mark as shown so they are not re-delivered.
  if (reminders.length > 0) {
    await supabase
      .from('reminders')
      .update({ shown_at: nowIso })
      .in(
        'id',
        reminders.map((r: { id: number }) => r.id)
      );
  }

  return NextResponse.json({ reminders });
}

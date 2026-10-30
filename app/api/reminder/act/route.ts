import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getTodayRange } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = ['acted', 'dismissed', 'snoozed'];
const HABITS = ['water', 'standup', 'vitamin', 'evening_checkin'];

export async function POST(req: NextRequest) {
  try {
    const { reminder_id, action, name } = await req.json();

    if (!reminder_id || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    const { data: rem } = await supabase
      .from('reminders')
      .select('name, scheduled_at, acted_at, dismissed_at')
      .eq('id', reminder_id)
      .maybeSingle();

    // #88: the reminder row is the source of truth for the habit; the client
    // extra can be stale (e.g. a standup label on a water reminder).
    const habit: string | null = HABITS.includes(rem?.name)
      ? rem!.name
      : HABITS.includes(name)
        ? name
        : null;

    // #78: a reminder from a previous product day must not mark today done.
    if (action === 'acted') {
      const tz = await getConfigTimezone();
      const { start } = getTodayRange(tz);
      const scheduledAt = rem?.scheduled_at
        ? new Date(rem.scheduled_at)
        : null;
      if (scheduledAt && scheduledAt < start) {
        return NextResponse.json({ ok: true, ignored: 'stale_reminder' });
      }
      if (rem?.acted_at) {
        return NextResponse.json({ ok: true, ignored: 'already_acted' });
      }
    }

    const patch: Record<string, unknown> = {};
    if (action === 'acted') patch.acted_at = new Date().toISOString();
    if (action === 'dismissed') patch.dismissed_at = new Date().toISOString();
    if (action === 'snoozed') patch.shown_at = null;

    const { error } = await supabase
      .from('reminders')
      .update(patch)
      .eq('id', reminder_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit only. The habit signal itself is written by the client to
    // POST /api/signal {name, source:'reminder'} (P1-41) — do not write a
    // second habit signal here or the count would double.
    if (action === 'acted' && habit) {
      await supabase.from('signals').insert({
        name: 'reminder_acted',
        type: 'event',
        value: true,
        source: 'reminder',
        context: { habit, reminder_name: habit, reminder_id },
      });

      // #88: the collector also posts the habit signal, but that POST can fail
      // offline and was lost silently (water stayed 0/6). Backfill it here with
      // a 2-minute dedupe window so counts are correct exactly once.
      const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: existingHabit } = await supabase
        .from('signals')
        .select('id')
        .eq('name', habit)
        .gte('created_at', since)
        .limit(1)
        .maybeSingle();
      if (!existingHabit) {
        await supabase.from('signals').insert({
          name: habit,
          type: habit === 'water' ? 'count' : 'event',
          value: habit === 'water' ? 1 : true,
          source: 'reminder',
          context: { via: 'reminder_act', reminder_id },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('reminder/act error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

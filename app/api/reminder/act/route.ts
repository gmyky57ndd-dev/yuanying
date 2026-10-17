import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = ['acted', 'dismissed', 'snoozed'];
const HABITS = ['water', 'standup', 'vitamin'];

export async function POST(req: NextRequest) {
  try {
    const { reminder_id, action, name } = await req.json();

    if (!reminder_id || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    const { data: rem } = await supabase
      .from('reminders')
      .select('name')
      .eq('id', reminder_id)
      .maybeSingle();

    const habit: string | null = HABITS.includes(name)
      ? name
      : HABITS.includes(rem?.name)
        ? rem!.name
        : null;

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
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('reminder/act error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

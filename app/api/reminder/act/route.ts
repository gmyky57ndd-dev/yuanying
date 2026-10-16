import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = ['acted', 'dismissed', 'snoozed'];
const HABITS = ['water', 'standup', 'vitamin'];
const COUNT_HABITS = ['water', 'standup'];

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

    // Prefer the habit name the client sends (robust if the reminder row is
    // missing); otherwise fall back to the stored reminder name.
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

    // ES-007 §4 + habits bugfix: an acted reminder IS the habit action —
    // 喝水/起身 +1, 维生素 done. Recorded once here (single source of truth).
    if (action === 'acted' && habit) {
      await supabase.from('signals').insert({
        name: 'reminder_acted',
        type: 'event',
        value: true,
        source: 'reminder',
        context: { habit, reminder_name: habit, reminder_id },
      });
      await supabase.from('signals').insert({
        name: habit,
        type: COUNT_HABITS.includes(habit) ? 'count' : 'event',
        value: COUNT_HABITS.includes(habit) ? 1 : true,
        source: 'reminder',
        context: { habit, reminder_id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('reminder/act error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

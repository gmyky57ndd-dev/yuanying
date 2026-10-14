import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = ['acted', 'dismissed', 'snoozed'];

export async function POST(req: NextRequest) {
  try {
    const { reminder_id, action } = await req.json();

    if (!reminder_id || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    const { data: rem } = await supabase
      .from('reminders')
      .select('name')
      .eq('id', reminder_id)
      .maybeSingle();

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

    if (action === 'acted' && rem) {
      await supabase.from('signals').insert({
        name: 'reminder_acted',
        type: 'event',
        value: true,
        source: 'manual',
        context: { reminder_name: rem.name, reminder_id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('reminder/act error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

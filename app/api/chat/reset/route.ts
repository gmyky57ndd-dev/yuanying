import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ES-045: break a stuck chat loop by excluding earlier messages from context. */
export async function POST() {
  const { error } = await supabase.from('config').upsert(
    { key: 'chat_reset_at', value: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

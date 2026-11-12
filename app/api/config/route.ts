import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { mirrorConfig } from '@/lib/local-write';
import { localConfig } from '@/lib/local-read';
import { enqueueOutbox } from '@/lib/outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get('source') !== 'cloud') {
    const local = localConfig();
    if (Object.keys(local).length > 0 || url.searchParams.get('local') === '1') {
      return NextResponse.json({ ...local, local: true });
    }
  }
  const { data, error } = await supabase.from('config').select('*');

  if (error) {
    console.warn('config: falling back to local SQLite', error.message);
    return NextResponse.json({ ...localConfig(), local: true });
  }

  const config = Object.fromEntries(
    (data ?? []).map((row: { key: string; value: unknown }) => [
      row.key,
      row.value,
    ])
  );

  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const updates = Object.entries(body).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('config')
    .upsert(updates, { onConflict: 'key' });

  if (error) {
    for (const [key, value] of Object.entries(body)) {
      mirrorConfig(key, value);
      enqueueOutbox('config', 'upsert', { key, value });
    }
    return NextResponse.json({ ok: true, queued: true });
  }
  for (const [key, value] of Object.entries(body)) {
    mirrorConfig(key, value);
  }

  return NextResponse.json({ ok: true });
}

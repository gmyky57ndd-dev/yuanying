import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase.from('config').select('*');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

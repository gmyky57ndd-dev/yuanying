import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ES-013: list Fenshen + the active one (for the settings dropdown). */
export async function GET() {
  const [{ data: rows, error }, { data: cfg }] = await Promise.all([
    supabase
      .from('fenshen')
      .select('id, display_name, avatar_url')
      .order('id'),
    supabase
      .from('config')
      .select('value')
      .eq('key', 'active_fenshen')
      .maybeSingle(),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const active =
    typeof cfg?.value === 'string' ? cfg.value : (rows?.[0]?.id ?? 'xiaowu');
  return NextResponse.json({ fenshen: rows ?? [], active });
}

/** Switch the active Fenshen. A DB write — no deployment needed. */
export async function PUT(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (typeof id !== 'string' || id.trim().length === 0) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { data: row } = await supabase
      .from('fenshen')
      .select('id, display_name')
      .eq('id', id.trim().toLowerCase())
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: 'no such fenshen' }, { status: 404 });
    }

    const { error } = await supabase
      .from('config')
      .upsert(
        { key: 'active_fenshen', value: row.id },
        { onConflict: 'key' }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, active: row.id, display_name: row.display_name });
  } catch {
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

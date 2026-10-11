import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { name, value, note } = await req.json();
  const allowed = ['wake', 'sleep', 'water', 'sit'];
  if (!allowed.includes(name)) {
    return NextResponse.json({ error: 'invalid name' }, { status: 400 });
  }

  const { error } = await supabase
    .from('signals')
    .insert({ name, value: value ?? null, note: note ?? null });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('signals')
    .select('*')
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false });

  return NextResponse.json({ signals: data ?? [] });
}

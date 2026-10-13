import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('signals')
    .select('name, created_at')
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const signals = (data ?? []) as Array<{ name: string; created_at: string }>;

  return NextResponse.json({
    date: startOfDay.toISOString().slice(0, 10),
    wake: signals.find(s => s.name === 'wake')?.created_at ?? null,
    sleep: signals.find(s => s.name === 'sleep')?.created_at ?? null,
    water_count: signals.filter(s => s.name === 'water').length,
    sit_count: signals.filter(s => s.name === 'sit').length,
    signals_total: signals.length,
  });
}

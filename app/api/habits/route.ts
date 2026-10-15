import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ES-001 v1: read-only active habit configuration.
 * Write endpoints are deferred to v1.1 and gated on ES-004 (API auth).
 */
export async function GET() {
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('active', true)
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ habits: data ?? [] });
}

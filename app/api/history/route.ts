import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data } = await supabase
    .from('messages')
    .select('role, content')
    .order('created_at', { ascending: true })
    .limit(50);

  return NextResponse.json({ messages: data ?? [] });
}

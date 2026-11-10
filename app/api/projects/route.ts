import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ES-080: projects (Project → Role → Workpad → Artifact). */
export async function GET() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, status, created_at')
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id ?? '').trim().toLowerCase();
    const name = String(body?.name ?? '').trim();
    if (!/^[a-z0-9_-]{2,32}$/.test(id)) {
      return NextResponse.json({ error: 'id must be 2-32 chars [a-z0-9_-]' }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const { data, error } = await supabase
      .from('projects')
      .insert({ id, name, description: String(body?.description ?? '') })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ project: data });
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
}

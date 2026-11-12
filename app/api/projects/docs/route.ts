import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { mirrorProjectDoc } from '@/lib/local-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** ES-080: project documents live in the cloud so any fenshen can read them. */
export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get('project_id')?.trim();
  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('project_docs')
    .select('name, updated_at, length(content) as chars')
    .eq('project_id', projectId)
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project_id: projectId, docs: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projectId = String(body?.project_id ?? '').trim();
    const name = String(body?.name ?? '').trim();
    const content = String(body?.content ?? '');
    if (!projectId || !name) {
      return NextResponse.json({ error: 'project_id and name required' }, { status: 400 });
    }
    if (!content.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9._-]+\.(md|txt|json)$/.test(name)) {
      return NextResponse.json({ error: 'name must be .md/.txt/.json' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('project_docs')
      .upsert(
        { project_id: projectId, name, content, updated_at: new Date().toISOString() },
        { onConflict: 'project_id,name' }
      )
      .select('name, updated_at, length(content) as chars')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    mirrorProjectDoc({ project_id: projectId, name, content });
    return NextResponse.json({ doc: data });
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
}

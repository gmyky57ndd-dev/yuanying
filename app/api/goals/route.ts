import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get('project_id')?.trim();
  let q = supabase
    .from('goals')
    .select('id, project_id, title, status, due_date, created_at, completed_at')
    .order('status')
    .order('created_at', { ascending: false });
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goals: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body?.title ?? '').trim();
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    const { data, error } = await supabase
      .from('goals')
      .insert({
        project_id: body?.project_id || null,
        title: title.slice(0, 300),
        due_date: body?.due_date || null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ goal: data });
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if (typeof body?.title === 'string' && body.title.trim()) {
      patch.title = body.title.trim().slice(0, 300);
    }
    if (body?.status === 'open' || body?.status === 'done') {
      patch.status = body.status;
      patch.completed_at = body.status === 'done' ? new Date().toISOString() : null;
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('goals')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ goal: data });
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

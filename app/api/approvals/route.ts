import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Phase 1: PM → ADR → owner approval → DSH. */
export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get('project_id')?.trim();
  let q = supabase
    .from('approvals')
    .select('id, project_id, title, description, adr, status, created_by, approved_by, issue_url, created_at, updated_at, approved_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ approvals: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projectId = String(body?.project_id ?? '').trim();
    const title = String(body?.title ?? '').trim();
    if (!projectId || !title) {
      return NextResponse.json({ error: 'project_id and title required' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('approvals')
      .insert({
        project_id: projectId,
        title: title.slice(0, 300),
        description: String(body?.description ?? '').slice(0, 4000),
        created_by: 'owner',
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ approval: data });
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
}

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  adr: { from: ['proposed', 'adr_ready'], to: 'adr_ready' },
  approve: { from: ['adr_ready'], to: 'approved' },
  reject: { from: ['proposed', 'adr_ready'], to: 'rejected' },
  implement: { from: ['approved'], to: 'implementing' },
  done: { from: ['implementing'], to: 'done' },
  reopen: { from: ['rejected'], to: 'proposed' },
};

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body?.id);
    const action = String(body?.action ?? '');
    const rule = TRANSITIONS[action];
    if (!Number.isInteger(id) || id <= 0 || !rule) {
      return NextResponse.json({ error: 'id and a valid action required' }, { status: 400 });
    }

    const { data: current } = await supabase
      .from('approvals')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (!current) return NextResponse.json({ error: 'approval not found' }, { status: 404 });
    if (!rule.from.includes(String(current.status))) {
      return NextResponse.json(
        { error: `cannot ${action} from ${current.status}` },
        { status: 409 }
      );
    }

    const patch: Record<string, unknown> = {
      status: rule.to,
      updated_at: new Date().toISOString(),
    };
    if (action === 'adr') {
      const adr = String(body?.adr ?? '').trim();
      if (!adr) return NextResponse.json({ error: 'adr required' }, { status: 400 });
      patch.adr = adr.slice(0, 12000);
    }
    if (action === 'approve') {
      patch.approved_by = 'owner';
      patch.approved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('approvals')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ approval: data });
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
}

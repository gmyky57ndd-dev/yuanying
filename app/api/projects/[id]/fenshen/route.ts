import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ES-080: fenshen participating in a workpad room. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  const { data, error } = await supabase
    .from('project_fenshen_map')
    .select('fenshen_id, is_lead, fenshen:fenshen_id(id, display_name, avatar_url, tools_whitelist, model_name)')
    .eq('project_id', projectId)
    .order('is_lead', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project_id: projectId, members: data ?? [] });
}

/** Replace the room membership (lead included). */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body = await req.json();
    const ids: string[] = Array.isArray(body?.fenshen_ids)
      ? body.fenshen_ids.filter((x: unknown) => typeof x === 'string')
      : [];
    const lead = typeof body?.lead === 'string' ? body.lead : ids[0];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'fenshen_ids required' }, { status: 400 });
    }
    const { data: rows } = await supabase
      .from('fenshen')
      .select('id')
      .in('id', ids);
    const known = new Set((rows ?? []).map((r: any) => r.id));
    const invalid = ids.filter(id => !known.has(id));
    if (invalid.length) {
      return NextResponse.json({ error: `unknown fenshen: ${invalid.join(', ')}` }, { status: 400 });
    }
    await supabase.from('project_fenshen_map').delete().eq('project_id', projectId);
    const { error } = await supabase.from('project_fenshen_map').insert(
      ids.map(id => ({ project_id: projectId, fenshen_id: id, is_lead: id === lead }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, project_id: projectId, members: ids, lead });
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
}

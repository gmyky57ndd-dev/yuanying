import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { ALL_TOOL_NAMES } from '@/lib/tool-names';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ES-080: read the fenshen playbooks for the desktop config UI. */
export async function GET() {
  const { data, error } = await supabase
    .from('fenshen')
    .select('id, display_name, prompt_md, tools_whitelist, kind, avatar_url')
    .order('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fenshen: data ?? [], tools: ALL_TOOL_NAMES });
}

/** Update prompt/whitelist. Model routing stays global (owner decision). */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id ?? '').trim();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body?.prompt_md === 'string') patch.prompt_md = body.prompt_md;
    if (Array.isArray(body?.tools_whitelist)) {
      const invalid = body.tools_whitelist.filter(
        (t: unknown) => typeof t !== 'string' || !ALL_TOOL_NAMES.includes(t as never)
      );
      if (invalid.length) {
        return NextResponse.json(
          { error: `unknown tools: ${invalid.join(', ')}` },
          { status: 400 }
        );
      }
      patch.tools_whitelist = body.tools_whitelist;
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('fenshen')
      .update(patch)
      .eq('id', id)
      .select('id, display_name, tools_whitelist')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ fenshen: data });
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
}

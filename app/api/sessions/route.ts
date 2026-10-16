import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { extractTags } from '@/lib/tags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LEN = 20000;

/**
 * ES-010 §2/§5: capture a distilled AI-session record. Mobile share sheet and
 * the import flow both land here. Stored as a `session` signal; a local script
 * (`scripts/import.mjs`) can materialize files under memory/conversations/.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = String(body?.text ?? '').trim();
    const context = String(body?.context ?? '').trim();
    const ai = String(body?.ai ?? '').trim();
    const source = body?.source === 'import' ? 'import' : 'share';

    if (text.length === 0) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    if (text.length > MAX_LEN) {
      return NextResponse.json({ error: 'too long' }, { status: 400 });
    }

    const tags = extractTags(`${context} ${text}`);

    const { data, error } = await supabase
      .from('signals')
      .insert({
        name: 'session',
        type: 'note',
        value: { text, context, ai: ai || null, tags },
        source,
        context: { source },
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data?.id ?? null, tags });
  } catch {
    console.error('session POST error');
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function GET() {
  const { data, error } = await supabase
    .from('signals')
    .select('id, value, created_at')
    .eq('name', 'session')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const sessions = (data ?? []).map((r: any) => ({
    id: r.id,
    text: r.value?.text ?? '',
    context: r.value?.context ?? '',
    ai: r.value?.ai ?? null,
    tags: Array.isArray(r.value?.tags) ? r.value.tags : [],
    at: r.created_at,
  }));
  return NextResponse.json({ sessions });
}

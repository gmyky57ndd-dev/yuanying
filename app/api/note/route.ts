import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getTodayRange, getConfigTimezone } from '@/lib/timezone';
import { extractTags } from '@/lib/tags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LEN = 2000;

/** ES-012 §3: light heuristic — propose the feedback flag, never force it. */
function looksLikeFeedback(text: string): boolean {
  return /(\bbug\b|\bfix\b|\bbroken\b|\bshould\b|\bplease\b|修复|应该|建议|问题|错误|希望|能不能|崩溃|闪退)/i.test(
    text
  );
}

async function existingTags(): Promise<string[]> {
  const { data } = await supabase
    .from('signals')
    .select('value')
    .eq('name', 'note')
    .order('created_at', { ascending: false })
    .limit(200);
  const set = new Set<string>();
  for (const r of data ?? []) {
    const tags = (r as any).value?.tags;
    if (Array.isArray(tags)) for (const t of tags) set.add(String(t));
  }
  return Array.from(set);
}

/** Today's notes (read-only list), scoped to the product day. */
export async function GET() {
  const tz = await getConfigTimezone();
  const { start, end } = getTodayRange(tz);

  const { data, error } = await supabase
    .from('signals')
    .select('id, value, context, created_at')
    .eq('name', 'note')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notes = (data ?? []).map((r: any) => ({
    id: r.id,
    text: r.value?.text ?? '',
    tags: Array.isArray(r.value?.tags) ? r.value.tags : [],
    feedback: r.value?.feedback === true,
    feedbackSuggested: r.value?.feedbackSuggested === true,
    input: r.context?.input ?? 'text',
    at: r.created_at,
  }));

  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  try {
    const { text, input } = await req.json();

    if (typeof text !== 'string') {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ error: 'empty note' }, { status: 400 });
    }
    if (trimmed.length > MAX_LEN) {
      return NextResponse.json(
        { error: `note too long (max ${MAX_LEN})` },
        { status: 400 }
      );
    }

    // ES-012 §2: tags auto-derived, never required. §3: propose feedback flag.
    const tags = extractTags(trimmed, await existingTags());
    const feedbackSuggested = looksLikeFeedback(trimmed);

    const { data, error } = await supabase
      .from('signals')
      .insert({
        name: 'note',
        type: 'note',
        value: { text: trimmed, tags, feedbackSuggested },
        source: 'manual',
        context: { input: input === 'voice' ? 'voice' : 'text' },
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data?.id ?? null, tags });
  } catch {
    // Do not log note content.
    console.error('note POST error');
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ES-012 §2/§3: edit a note's tags (add/remove) and the feedback flag.
 * Tags are user-editable but never required; the user may leave them empty.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { data: row, error: readErr } = await supabase
    .from('signals')
    .select('value, feedback_status')
    .eq('id', id)
    .eq('name', 'note')
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'note not found' }, { status: 404 });
  }

  const value: Record<string, any> = { ...(row.value ?? {}) };
  const update: Record<string, any> = { value };
  const currentStatus: string | null = row.feedback_status ?? null;

  if (Array.isArray(body.tags)) {
    value.tags = body.tags
      .map((t: unknown) => String(t).trim())
      .filter((t: string) => t.length > 0)
      .slice(0, 8);
  }
  if (typeof body.feedback === 'boolean') {
    value.feedback = body.feedback;
    if (!body.feedback) value.promoted = false;
    // ES-018: marking feedback starts the status at `new`.
    if (body.feedback && !currentStatus) update.feedback_status = 'new';
  }
  if (typeof body.promoted === 'boolean') {
    value.promoted = body.promoted;
  }
  if (typeof body.feedback_status === 'string') {
    const allowed = ['new', 'inbox', 'pushed', 'resolved'];
    if (!allowed.includes(body.feedback_status)) {
      return NextResponse.json(
        { error: `invalid feedback_status: ${body.feedback_status}` },
        { status: 400 }
      );
    }
    // ES-018 §5: only inbox/pushed can be marked resolved.
    if (
      body.feedback_status === 'resolved' &&
      !['inbox', 'pushed'].includes(currentStatus ?? '')
    ) {
      return NextResponse.json(
        { error: 'only inbox/pushed can be resolved' },
        { status: 400 }
      );
    }
    update.feedback_status = body.feedback_status;
  }

  const { error } = await supabase
    .from('signals')
    .update(update)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    tags: value.tags ?? [],
    feedback: value.feedback ?? false,
    feedback_status: update.feedback_status ?? currentStatus ?? 'new',
  });
}

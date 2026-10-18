import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDateInTimezone } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ES-018 §3 — commit a feedback note to `docs/pm/inbox/` via the GitHub
 * Contents API (Vercel's filesystem is read-only). On success the note's
 * `feedback_status` becomes `inbox`; on failure it stays `new`.
 */
export async function POST(req: NextRequest) {
  try {
    const { noteId } = await req.json();
    const id = Number(noteId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'noteId required' }, { status: 400 });
    }

    const { data: note } = await supabase
      .from('signals')
      .select('id, value, feedback_status, created_at')
      .eq('id', id)
      .eq('name', 'note')
      .maybeSingle();
    if (!note) {
      return NextResponse.json({ error: 'note not found' }, { status: 404 });
    }

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    if (!token || !repo) {
      return NextResponse.json(
        { error: 'GitHub config missing' },
        { status: 500 }
      );
    }

    const tz = await getConfigTimezone();
    const date = getDateInTimezone(tz, new Date(note.created_at));
    const path = `docs/pm/inbox/${date}-${id}.md`;
    const value = note.value ?? {};
    const tags = Array.isArray(value.tags)
      ? value.tags.map((t: string) => `#${t}`).join(' ')
      : '';
    const content = `# Feedback — note ${id}

- Date: ${date}
- Tags: ${tags || '—'}
- Status: inbox

## Problem

${String(value.text ?? '')}

---
_Sent via 元婴 → Inbox._
`;

    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'yuanying-fenshen',
    };

    // Retry-safe: if the file already exists, include its sha to update it.
    let sha: string | undefined;
    const existing = await fetch(url, { headers });
    if (existing.ok) {
      const g = await existing.json();
      sha = g?.sha;
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `feedback: inbox note ${id}`,
        content: Buffer.from(content, 'utf8').toString('base64'),
        ...(sha ? { sha } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err?.message ?? 'inbox commit failed' },
        { status: 500 }
      );
    }

    const data = await res.json();

    // Keep `promoted` for the legacy inbox script; set the new status.
    // Keep a later status (pushed/resolved) — Save to Inbox must not regress it.
    const keepStatus =
      note.feedback_status === 'pushed' || note.feedback_status === 'resolved';
    await supabase
      .from('signals')
      .update({
        ...(keepStatus ? {} : { feedback_status: 'inbox' }),
        value: { ...value, promoted: true },
      })
      .eq('id', id);

    return NextResponse.json({
      ok: true,
      path,
      html_url: data?.content?.html_url ?? null,
    });
  } catch (err) {
    console.error('inbox integration error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

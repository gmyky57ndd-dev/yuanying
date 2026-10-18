import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDateInTimezone } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ES-018 §3 / ES-019: commit a feedback note OR a chat message to
 * `docs/pm/inbox/` via the GitHub Contents API. On success a note's
 * `feedback_status` becomes `inbox`; a message is unchanged.
 */
export async function POST(req: NextRequest) {
  try {
    const { noteId, messageId } = await req.json();

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    if (!token || !repo) {
      return NextResponse.json(
        { error: 'GitHub config missing' },
        { status: 500 }
      );
    }

    const tz = await getConfigTimezone();
    let date = getDateInTimezone(tz);
    let path = '';
    let content = '';
    let noteStatus: string | null = null;
    let noteValue: Record<string, any> = {};
    let noteIdNum: number | null = null;

    if (messageId) {
      const id = Number(messageId);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ error: 'invalid messageId' }, { status: 400 });
      }
      const { data: msg } = await supabase
        .from('messages')
        .select('id, content, created_at')
        .eq('id', id)
        .maybeSingle();
      if (!msg) {
        return NextResponse.json({ error: 'message not found' }, { status: 404 });
      }
      date = getDateInTimezone(tz, new Date(msg.created_at));
      path = `docs/pm/inbox/${date}-msg-${id}.md`;
      content = `# Feedback — message ${id}

- Date: ${date}
- Source: chat message

## Problem

${msg.content}

---
_Sent via 元婴 → Inbox._
`;
    } else if (noteId) {
      const id = Number(noteId);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ error: 'invalid noteId' }, { status: 400 });
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
      noteIdNum = id;
      noteStatus = note.feedback_status ?? null;
      noteValue = note.value ?? {};
      date = getDateInTimezone(tz, new Date(note.created_at));
      path = `docs/pm/inbox/${date}-${id}.md`;
      const tags = Array.isArray(noteValue.tags)
        ? noteValue.tags.map((t: string) => `#${t}`).join(' ')
        : '';
      content = `# Feedback — note ${id}

- Date: ${date}
- Tags: ${tags || '—'}
- Status: inbox

## Problem

${String(noteValue.text ?? '')}

---
_Sent via 元婴 → Inbox._
`;
    } else {
      return NextResponse.json(
        { error: 'noteId or messageId required' },
        { status: 400 }
      );
    }

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
        message: `feedback: inbox ${messageId ? `message ${messageId}` : `note ${noteId}`}`,
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

    if (noteIdNum) {
      // Keep a later status (pushed/resolved) — Save to Inbox must not regress it.
      const keepStatus =
        noteStatus === 'pushed' || noteStatus === 'resolved';
      await supabase
        .from('signals')
        .update({
          ...(keepStatus ? {} : { feedback_status: 'inbox' }),
          value: { ...noteValue, promoted: true },
        })
        .eq('id', noteIdNum);
    }

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

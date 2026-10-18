import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function firstLine(s: string): string {
  const line = String(s ?? '')
    .split('\n')
    .find(l => l.trim()) ?? '';
  const t = line.trim().replace(/^#+\s*/, '');
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

/**
 * ES-017 / ES-019: create a GitHub issue from 元婴 feedback — either a note
 * (`note_id`) or a chat message (`message_id`). Idempotent: an existing issue
 * for the source is returned instead of creating a duplicate.
 */
export async function POST(req: NextRequest) {
  try {
    const { title, body, note_id, message_id } = await req.json();

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    if (!token || !repo) {
      return NextResponse.json(
        { error: 'GitHub config missing' },
        { status: 500 }
      );
    }

    let noteContext: Record<string, any> = {};
    let expectedTitle = typeof title === 'string' ? title.trim() : '';
    let expectedBody = typeof body === 'string' ? body : '';

    // Guardrail: return the existing issue for this note.
    if (note_id) {
      const { data: note } = await supabase
        .from('signals')
        .select('value, context, feedback_status')
        .eq('id', note_id)
        .eq('name', 'note')
        .maybeSingle();
      noteContext = note?.context ?? {};
      if (noteContext.github_issue_url) {
        return NextResponse.json({
          ok: true,
          issue_url: noteContext.github_issue_url,
          number: noteContext.github_issue_number ?? null,
          already: true,
        });
      }
    }

    // Guardrail: return the existing issue for this message.
    if (message_id) {
      const { data: msg } = await supabase
        .from('messages')
        .select('content, github_issue_url, github_issue_number')
        .eq('id', message_id)
        .maybeSingle();
      if (!msg) {
        return NextResponse.json({ error: 'message not found' }, { status: 404 });
      }
      if (msg.github_issue_url) {
        return NextResponse.json({
          ok: true,
          issue_url: msg.github_issue_url,
          number: msg.github_issue_number ?? null,
          already: true,
        });
      }
      if (!expectedTitle) {
        expectedTitle = `[元婴 feedback] ${firstLine(msg.content)}`;
      }
      if (!expectedBody) expectedBody = msg.content;
    }

    expectedTitle = (expectedTitle || 'Yuanying Feedback').slice(0, 200);
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'yuanying-fenshen',
    };

    // Title-based guardrail (covers issues created before we stored links).
    try {
      const listRes = await fetch(
        `https://api.github.com/repos/${repo}/issues?state=all&per_page=100&sort=created&direction=desc`,
        { headers }
      );
      if (listRes.ok) {
        const list = await listRes.json();
        const hit = Array.isArray(list)
          ? list.find(
              (i: any) => !i.pull_request && i.title === expectedTitle
            )
          : null;
        if (hit) {
          await attachIssue({
            note_id,
            message_id,
            noteContext,
            url: hit.html_url,
            number: hit.number,
          });
          return NextResponse.json({
            ok: true,
            issue_url: hit.html_url,
            number: hit.number,
            already: true,
          });
        }
      }
    } catch {
      // Non-fatal: fall through and create the issue.
    }

    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: expectedTitle,
          body: expectedBody,
          labels: ['yuanying-feedback'],
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err?.message ?? 'github error' },
        { status: res.status }
      );
    }

    const data = await res.json();
    await attachIssue({
      note_id,
      message_id,
      noteContext,
      url: data.html_url,
      number: data.number,
    });

    return NextResponse.json({
      ok: true,
      issue_url: data.html_url,
      number: data.number,
    });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function attachIssue(opts: {
  note_id?: number;
  message_id?: number;
  noteContext: Record<string, any>;
  url: string;
  number: number;
}) {
  if (opts.note_id) {
    await supabase
      .from('signals')
      .update({
        feedback_status: 'pushed',
        context: {
          ...opts.noteContext,
          github_issue_url: opts.url,
          github_issue_number: opts.number,
        },
      })
      .eq('id', opts.note_id);
  }
  if (opts.message_id) {
    await supabase
      .from('messages')
      .update({
        github_issue_url: opts.url,
        github_issue_number: opts.number,
      })
      .eq('id', opts.message_id);
  }
}

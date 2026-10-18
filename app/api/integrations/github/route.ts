import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ES-017 §2 — create a GitHub issue from 元婴 feedback.
 * Requires GITHUB_TOKEN and GITHUB_REPO in the environment (server-only).
 * On missing config the client falls back to the clipboard.
 */
export async function POST(req: NextRequest) {
  try {
    const { title, body, note_id } = await req.json();

    if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
      return NextResponse.json(
        { error: 'GitHub config missing' },
        { status: 500 }
      );
    }

    // Guardrail: if this note already produced an issue, return it instead of
    // creating a duplicate.
    if (note_id) {
      const { data: existing } = await supabase
        .from('signals')
        .select('context, feedback_status')
        .eq('id', note_id)
        .eq('name', 'note')
        .maybeSingle();
      const issueUrl = existing?.context?.github_issue_url;
      if (issueUrl) {
        return NextResponse.json({
          ok: true,
          issue_url: issueUrl,
          number: existing?.context?.github_issue_number ?? null,
          already: true,
        });
      }
    }

    const res = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          // GitHub requires a User-Agent.
          'User-Agent': 'yuanying-fenshen',
        },
        body: JSON.stringify({
          title: title || 'Yuanying Feedback',
          body,
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

    // ES-018 §4: mark the note `pushed` and store the issue link.
    if (note_id) {
      const { data: note } = await supabase
        .from('signals')
        .select('context')
        .eq('id', note_id)
        .eq('name', 'note')
        .maybeSingle();
      const context = {
        ...(note?.context ?? {}),
        github_issue_url: data.html_url,
        github_issue_number: data.number,
      };
      await supabase
        .from('signals')
        .update({ feedback_status: 'pushed', context })
        .eq('id', note_id);
    }

    return NextResponse.json({
      ok: true,
      issue_url: data.html_url,
      number: data.number,
    });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

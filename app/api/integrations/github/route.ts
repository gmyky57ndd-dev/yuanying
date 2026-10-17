import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ES-014 §3.1 — create a GitHub issue from 元婴 feedback.
 * Requires GITHUB_TOKEN and GITHUB_REPO in the environment (server-only).
 */
export async function POST(req: NextRequest) {
  try {
    const { title, body, labels } = await req.json();

    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'title required' }, { status: 400 });
    }
    if (typeof body !== 'string' || body.trim().length === 0) {
      return NextResponse.json({ error: 'body required' }, { status: 400 });
    }

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    if (!token || !repo) {
      return NextResponse.json(
        { error: 'github integration not configured (GITHUB_TOKEN / GITHUB_REPO)' },
        { status: 503 }
      );
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'yuanying-fenshen',
      },
      body: JSON.stringify({
        title: title.trim().slice(0, 200),
        body,
        labels:
          Array.isArray(labels) && labels.length > 0
            ? labels
            : ['yuanying-feedback'],
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('github issue failed:', res.status, data?.message);
      return NextResponse.json(
        { error: data?.message ?? 'github error' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      number: data.number,
      url: data.html_url,
    });
  } catch (err) {
    console.error('github integration error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

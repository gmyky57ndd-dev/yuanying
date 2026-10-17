import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ES-017 §2 — create a GitHub issue from 元婴 feedback.
 * Requires GITHUB_TOKEN and GITHUB_REPO in the environment (server-only).
 * On missing config the client falls back to the clipboard.
 */
export async function POST(req: NextRequest) {
  try {
    const { title, body } = await req.json();

    if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
      return NextResponse.json(
        { error: 'GitHub config missing' },
        { status: 500 }
      );
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
    return NextResponse.json({
      ok: true,
      issue_url: data.html_url,
      number: data.number,
    });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GITHUB = 'https://api.github.com';

function issueNumber(context: any): number | null {
  const n = Number(context?.github_issue_number);
  if (Number.isInteger(n) && n > 0) return n;
  const url = String(context?.github_issue_url ?? '');
  const m = url.match(/\/issues\/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Issue #95: close the feedback loop. GitHub issues are the source of truth for
 * "done"; this poller flips pushed feedback to resolved when its issue closes.
 * Idempotent: only `pushed` rows are touched, and `resolved` never moves again.
 */
async function run() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    return { status: 503, body: { error: 'GitHub not configured' } };
  }

  const { data, error } = await supabase
    .from('signals')
    .select('id, context')
    .eq('name', 'note')
    .eq('feedback_status', 'pushed')
    .order('id', { ascending: false })
    .limit(100);
  if (error) return { status: 500, body: { error: error.message } };

  const rows = (data ?? []) as any[];
  let checked = 0;
  let resolved = 0;
  let failed = 0;

  for (const row of rows) {
    const num = issueNumber(row.context);
    if (!num) continue;
    checked += 1;
    try {
      const res = await fetch(`${GITHUB}/repos/${repo}/issues/${num}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'yuanying-feedback-sync',
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        failed += 1;
        continue;
      }
      const issue = (await res.json()) as { state?: string };
      if (issue.state !== 'closed') continue;
      const now = new Date().toISOString();
      const { error: upErr } = await supabase
        .from('signals')
        .update({
          feedback_status: 'resolved',
          resolved_at: now,
          context: { ...(row.context ?? {}), resolved_at: now },
        })
        .eq('id', row.id)
        .eq('feedback_status', 'pushed');
      if (upErr) failed += 1;
      else resolved += 1;
    } catch {
      failed += 1;
    }
  }

  return { status: 200, body: { ok: true, checked, resolved, failed } };
}

function authorized(req: NextRequest): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const r = await run();
  return NextResponse.json(r.body, { status: r.status });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

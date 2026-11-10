import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ES-080: issues associated with a project via the `project:<id>` label. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    return NextResponse.json({ error: 'GitHub not configured' }, { status: 503 });
  }
  const q = `repo:${repo} is:issue label:project:${params.id}`;
  const res = await fetch(
    `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=10&sort=updated`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'yuanying-workpad',
      },
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    return NextResponse.json({ error: `GitHub HTTP ${res.status}` }, { status: 502 });
  }
  const data = await res.json();
  return NextResponse.json({
    project_id: params.id,
    issues: (data?.items ?? []).map((i: any) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      url: i.html_url,
      updated_at: i.updated_at,
      labels: (i.labels ?? []).map((l: any) => l.name),
    })),
  });
}

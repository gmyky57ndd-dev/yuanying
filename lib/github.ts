/**
 * ES-022: shared GitHub issue creation for the UI routes (ES-017/ES-019) and
 * the `push_to_dev` tool. Idempotent by exact title among recent issues.
 */

export class GitHubConfigError extends Error {
  constructor() {
    super('GitHub config missing');
    this.name = 'GitHubConfigError';
  }
}

export class GitHubRequestError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'GitHubRequestError';
    this.status = status;
  }
}

export type CreatedIssue = {
  issue_url: string;
  number: number;
  already?: boolean;
};

export async function findOrCreateIssue(
  title: string,
  body: string
): Promise<CreatedIssue> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) throw new GitHubConfigError();

  const expectedTitle = (title.trim() || 'Yuanying Feedback').slice(0, 200);
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
        ? list.find((i: any) => !i.pull_request && i.title === expectedTitle)
        : null;
      if (hit) {
        return {
          issue_url: hit.html_url,
          number: hit.number,
          already: true,
        };
      }
    }
  } catch {
    // Non-fatal: fall through and create the issue.
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: expectedTitle,
      body,
      labels: ['yuanying-feedback'],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new GitHubRequestError(
      (err as any)?.message ?? 'github error',
      res.status
    );
  }

  const data = await res.json();
  return { issue_url: data.html_url, number: data.number };
}

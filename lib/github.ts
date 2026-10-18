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
  already: boolean;
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

  // Idempotency: exact title match among the most recent 100 issues. There is
  // no separate key or body hash; `already:false` means no match was found and
  // the issue was created by this call.
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
        console.log('github issue resolved', {
          number: hit.number,
          already: true,
          repo,
        });
        return {
          issue_url: hit.html_url,
          number: hit.number,
          already: true,
        };
      }
    } else {
      // Non-fatal for creation, but keep the status for diagnostics.
      console.warn('github issue list failed', {
        status: listRes.status,
        repo,
      });
    }
  } catch (e) {
    console.warn('github issue list error', {
      error: e instanceof Error ? e.message : String(e),
      repo,
    });
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
    const text = await res.text();
    let message = `github error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.message) message = String(parsed.message);
    } catch {
      // Keep the status-based message for non-JSON responses.
    }
    console.error('github issue create failed', {
      status: res.status,
      repo,
      title: expectedTitle,
      body: text.slice(0, 2000),
    });
    throw new GitHubRequestError(message, res.status);
  }

  const data = await res.json();
  if (!data?.html_url || typeof data?.number !== 'number') {
    console.error('github issue create invalid response', {
      repo,
      title: expectedTitle,
      keys: data && typeof data === 'object' ? Object.keys(data) : [],
    });
    throw new GitHubRequestError(
      'github response missing issue_url/number',
      502
    );
  }

  console.log('github issue created', {
    number: data.number,
    repo,
  });
  return { issue_url: data.html_url, number: data.number, already: false };
}

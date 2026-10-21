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

const GITHUB_TIMEOUT_MS = 8000;

async function githubFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  const external = init.signal;
  const onAbort = () => controller.abort();
  external?.addEventListener('abort', onAbort);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}

export type CreatedIssue = {
  issue_url: string;
  number: number;
  already: boolean;
};

export async function findOrCreateIssue(
  title: string,
  body: string,
  opts: { signal?: AbortSignal } = {}
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
    const listRes = await githubFetch(
      `https://api.github.com/repos/${repo}/issues?state=all&per_page=100&sort=created&direction=desc`,
      { headers, signal: opts.signal }
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

  const res = await githubFetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    signal: opts.signal,
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

  // Issue #21/#24: read the issue back from GitHub before reporting success.
  // The returned number/URL must come from a real GET, not just the POST body.
  const verifyRes = await githubFetch(
    `https://api.github.com/repos/${repo}/issues/${data.number}`,
    { headers, signal: opts.signal }
  );
  if (!verifyRes.ok) {
    console.error('github issue readback failed', {
      status: verifyRes.status,
      number: data.number,
      repo,
    });
    throw new GitHubRequestError(
      `github issue readback failed (HTTP ${verifyRes.status})`,
      502
    );
  }

  const verified = await verifyRes.json();
  if (
    typeof verified?.number !== 'number' ||
    typeof verified?.html_url !== 'string' ||
    verified.number !== data.number ||
    verified.html_url !== data.html_url
  ) {
    console.error('github issue readback mismatch', {
      number: data.number,
      repo,
    });
    throw new GitHubRequestError('github issue readback mismatch', 502);
  }

  console.log('github issue created and verified', {
    number: verified.number,
    repo,
  });
  return {
    issue_url: verified.html_url,
    number: verified.number,
    already: false,
  };
}

export type IssueComment = {
  author: string;
  body: string;
  created_at: string;
};

export type IssueDetails = {
  number: number;
  title: string;
  state: string;
  labels: string[];
  url: string;
  body: string;
  comments: IssueComment[];
  comments_truncated: boolean;
  comments_error: string | null;
};

function clip(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

/** ES-038: read an issue + its comments so 元婴 can verify delivery. */
export async function getIssue(issueNumber: number): Promise<IssueDetails> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) throw new GitHubConfigError();
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new GitHubRequestError('issue_number must be a positive integer', 400);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'yuanying-fenshen',
  };

  const res = await githubFetch(
    `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
    { headers }
  );
  if (!res.ok) {
    if (res.status === 404) {
      throw new GitHubRequestError(`Issue #${issueNumber} not found`, 404);
    }
    throw new GitHubRequestError(
      `github issue lookup failed (HTTP ${res.status})`,
      res.status
    );
  }

  const issue = await res.json();
  let comments: any[] = [];
  let commentsError: string | null = null;
  try {
    const commentsRes = await githubFetch(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments?per_page=20`,
      { headers }
    );
    if (commentsRes.ok) {
      const data = await commentsRes.json();
      comments = Array.isArray(data) ? data : [];
    } else {
      commentsError = `comments lookup failed (HTTP ${commentsRes.status})`;
    }
  } catch (e) {
    commentsError = e instanceof Error ? e.message : 'comments lookup failed';
  }

  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: Array.isArray(issue.labels)
      ? issue.labels.map((label: any) =>
          typeof label === 'string' ? label : label?.name ?? ''
        )
      : [],
    url: issue.html_url,
    body: clip(String(issue.body ?? ''), 4000),
    comments: comments.slice(0, 20).map((comment: any) => ({
      author: comment?.user?.login ?? 'unknown',
      body: clip(String(comment?.body ?? ''), 2000),
      created_at: comment?.created_at ?? '',
    })),
    comments_truncated: comments.length >= 20,
    comments_error: commentsError,
  };
}

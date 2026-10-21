import { test } from 'node:test';
import assert from 'node:assert';
import { findOrCreateIssue, getIssue } from './github.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('findOrCreateIssue verifies the created issue before success', async () => {
  const previous = {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    fetch: globalThis.fetch,
  };
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPO = 'owner/repo';

  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
    if (calls.length === 1) return json([]); // list: no existing issue
    if (calls.length === 2) {
      return json({
        number: 7,
        html_url: 'https://github.com/owner/repo/issues/7',
      });
    }
    return json({
      number: 7,
      html_url: 'https://github.com/owner/repo/issues/7',
    }); // read-back
  }) as typeof fetch;

  try {
    const issue = await findOrCreateIssue('test title', 'test body');
    assert.strictEqual(issue.number, 7);
    assert.strictEqual(issue.already, false);
    assert.strictEqual(issue.issue_url, 'https://github.com/owner/repo/issues/7');
    assert.strictEqual(calls.length, 3);
    assert.match(calls[2], /\/issues\/7$/);
  } finally {
    globalThis.fetch = previous.fetch;
    process.env.GITHUB_TOKEN = previous.token;
    process.env.GITHUB_REPO = previous.repo;
  }
});

test('findOrCreateIssue fails when read-back mismatches', async () => {
  const previous = {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    fetch: globalThis.fetch,
  };
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPO = 'owner/repo';

  let call = 0;
  globalThis.fetch = (async () => {
    call++;
    if (call === 1) return json([]);
    if (call === 2) {
      return json({
        number: 7,
        html_url: 'https://github.com/owner/repo/issues/7',
      });
    }
    return json({
      number: 8,
      html_url: 'https://github.com/owner/repo/issues/8',
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => findOrCreateIssue('test title', 'test body'),
      /readback mismatch/
    );
  } finally {
    globalThis.fetch = previous.fetch;
    process.env.GITHUB_TOKEN = previous.token;
    process.env.GITHUB_REPO = previous.repo;
  }
});

test('getIssue returns state, labels, and comments', async () => {
  const previous = {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    fetch: globalThis.fetch,
  };
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPO = 'owner/repo';

  let call = 0;
  globalThis.fetch = (async () => {
    call++;
    if (call === 1) {
      return json({
        number: 16,
        title: 'Issue 16',
        state: 'closed',
        labels: [{ name: 'yuanying-feedback' }],
        html_url: 'https://github.com/owner/repo/issues/16',
        body: 'body',
      });
    }
    return json([
      {
        user: { login: 'dev' },
        body: 'fixed',
        created_at: '2026-10-20T00:00:00Z',
      },
    ]);
  }) as typeof fetch;

  try {
    const issue = await getIssue(16);
    assert.strictEqual(issue.state, 'closed');
    assert.deepStrictEqual(issue.labels, ['yuanying-feedback']);
    assert.strictEqual(issue.comments[0].author, 'dev');
    assert.strictEqual(issue.comments[0].body, 'fixed');
  } finally {
    globalThis.fetch = previous.fetch;
    process.env.GITHUB_TOKEN = previous.token;
    process.env.GITHUB_REPO = previous.repo;
  }
});

import { test } from 'node:test';
import assert from 'node:assert';
import { writeMarkdown } from './write-markdown.ts';

test('write_markdown rejects unsafe and non-allowlisted paths', async () => {
  for (const path of [
    '../etc/passwd',
    '/etc/passwd',
    'core/identity.md',
    'core/voice.md',
    'docs/specs/x.md',
    'core/ground-rules.txt',
  ]) {
    await assert.rejects(() => writeMarkdown(path, 'x'), /Unsafe|not allowed|Only \.md/);
  }
});

test('write_markdown creates a Git commit for an allowlisted file', async () => {
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
    if ((init?.method ?? 'GET') === 'GET') {
      return new Response('', { status: 404 });
    }
    return new Response(
      JSON.stringify({
        commit: { sha: 'commit-sha' },
        content: { html_url: 'https://github.com/owner/repo/blob/main/core/ground-rules.md' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const result = await writeMarkdown('core/ground-rules.md', '# Rules\n');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.action, 'created');
    assert.strictEqual(result.data.commit_sha, 'commit-sha');
    assert.strictEqual(result.data.backup, 'git history');
    assert.strictEqual(calls.length, 2);
    assert.match(calls[1], /^PUT /);
  } finally {
    globalThis.fetch = previous.fetch;
    process.env.GITHUB_TOKEN = previous.token;
    process.env.GITHUB_REPO = previous.repo;
  }
});

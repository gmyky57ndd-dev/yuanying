const MAX_CONTENT_CHARS = 100_000;

const ALLOWED: RegExp[] = [
  /^core\/ground-rules\.md$/,
  /^core\/habits\.md$/,
  /^core\/opinions\/[a-z-]+\.md$/,
  /^core\/memory\/conversations\/[A-Za-z0-9._ -]+\.md$/,
];

function validate(path: string, content: string): string {
  const rel = path.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
  if (!rel || rel.startsWith('/') || rel.split('/').includes('..') || rel.includes('\0')) {
    throw new Error('Unsafe path.');
  }
  if (!rel.endsWith('.md')) throw new Error('Only .md files are supported.');
  if (!ALLOWED.some(re => re.test(rel))) {
    throw new Error(
      'Path not allowed. Allowed: core/ground-rules.md, core/habits.md, core/opinions/*.md, core/memory/conversations/*.md.'
    );
  }
  if (!content.trim()) throw new Error('content is required');
  if (Array.from(content).length > MAX_CONTENT_CHARS) {
    throw new Error(`content too large (max ${MAX_CONTENT_CHARS} characters)`);
  }
  return rel;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function ghFetch(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

export type WriteMarkdownResult = {
  success: true;
  data: {
    path: string;
    action: 'created' | 'updated';
    commit_sha: string;
    url: string;
    backup: 'git history';
  };
};

/** ES-046/ES-050: write an allowlisted core Markdown file via a Git commit. */
export async function writeMarkdown(
  inputPath: string,
  content: string
): Promise<WriteMarkdownResult> {
  const path = validate(inputPath, content);
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) throw new Error('GitHub config missing');

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'yuanying-fenshen',
  };
  const api = `https://api.github.com/repos/${repo}/contents/${encodePath(path)}`;

  let sha: string | undefined;
  const current = await ghFetch(`${api}?ref=main`, { headers });
  if (current.ok) {
    const data = await current.json();
    sha = typeof data?.sha === 'string' ? data.sha : undefined;
  } else if (current.status !== 404) {
    throw new Error(`GitHub file lookup failed (HTTP ${current.status})`);
  }

  const res = await ghFetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `chore(memory): update ${path} via 元婴`,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `GitHub write failed (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`
    );
  }

  const result = await res.json();
  return {
    success: true,
    data: {
      path,
      action: sha ? 'updated' : 'created',
      commit_sha: result?.commit?.sha ?? '',
      url: result?.content?.html_url ?? '',
      backup: 'git history',
    },
  };
}

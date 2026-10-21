import fs from 'fs';
import path from 'path';

const MAX_CHARS = 200_000;
const ALLOWED_EXT = ['.md', '.txt', '.json'];

function normalize(input: string): string {
  const rel = input.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
  if (!rel || rel.startsWith('/') || rel.split('/').includes('..') || rel.includes('\0')) {
    throw new Error('Unsafe path.');
  }
  if (!rel.startsWith('mailbox/')) {
    throw new Error('Path must start with mailbox/.');
  }
  if (!ALLOWED_EXT.some(ext => rel.endsWith(ext))) {
    throw new Error('Only .md, .txt, and .json mailbox files are supported.');
  }
  return rel;
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
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

function canUseGitHub(): boolean {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

export async function readMailbox(input: string): Promise<{
  success: true;
  data: { path: string; text: string; chars: number };
}> {
  const rel = normalize(input);
  const full = path.join(process.cwd(), rel);

  // Local development reads the working tree; production uses GitHub so writes
  // survive serverless cold starts and mailbox commits are visible immediately.
  if (process.env.NODE_ENV !== 'production' && fs.existsSync(full)) {
    const text = fs.readFileSync(full, 'utf-8');
    return { success: true, data: { path: rel, text, chars: Array.from(text).length } };
  }

  if (!canUseGitHub()) {
    if (!fs.existsSync(full)) throw new Error(`File not found: ${rel}`);
    const text = fs.readFileSync(full, 'utf-8');
    return { success: true, data: { path: rel, text, chars: Array.from(text).length } };
  }

  const token = process.env.GITHUB_TOKEN as string;
  const repo = process.env.GITHUB_REPO as string;
  const res = await ghFetch(
    `https://api.github.com/repos/${repo}/contents/${encodePath(rel)}?ref=main`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'yuanying-mailbox',
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Mailbox file not found (HTTP ${res.status}): ${rel}`);
  }
  const data = await res.json();
  const text = Buffer.from(String(data?.content ?? ''), 'base64').toString('utf-8');
  return { success: true, data: { path: rel, text, chars: Array.from(text).length } };
}

export async function writeMailbox(input: string, content: string): Promise<{
  success: true;
  data: {
    path: string;
    action: 'created' | 'updated';
    commit_sha: string;
    chars: number;
  };
}> {
  const rel = normalize(input);
  if (!content.trim()) throw new Error('content is required');
  if (Array.from(content).length > MAX_CHARS) {
    throw new Error(`content too large (max ${MAX_CHARS} characters)`);
  }

  if (process.env.NODE_ENV !== 'production' || !canUseGitHub()) {
    const full = path.join(process.cwd(), rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const existed = fs.existsSync(full);
    fs.writeFileSync(full, content, 'utf-8');
    return {
      success: true,
      data: {
        path: rel,
        action: existed ? 'updated' : 'created',
        commit_sha: '',
        chars: Array.from(content).length,
      },
    };
  }

  const token = process.env.GITHUB_TOKEN as string;
  const repo = process.env.GITHUB_REPO as string;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'yuanying-mailbox',
  };
  const api = `https://api.github.com/repos/${repo}/contents/${encodePath(rel)}`;

  let sha: string | undefined;
  const current = await ghFetch(`${api}?ref=main`, { headers });
  if (current.ok) {
    const data = await current.json();
    sha = typeof data?.sha === 'string' ? data.sha : undefined;
  } else if (current.status !== 404) {
    throw new Error(`Mailbox lookup failed (HTTP ${current.status})`);
  }

  const res = await ghFetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `chore(mailbox): update ${rel} via MCP`,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Mailbox write failed (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`
    );
  }
  const result = await res.json();
  return {
    success: true,
    data: {
      path: rel,
      action: sha ? 'updated' : 'created',
      commit_sha: result?.commit?.sha ?? '',
      chars: Array.from(content).length,
    },
  };
}

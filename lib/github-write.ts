import { supabase } from './db';

const TOKEN = () => process.env.GITHUB_TOKEN || '';
const REPO = () => process.env.GITHUB_REPO || '';

function headers() {
  return {
    Authorization: `Bearer ${TOKEN()}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'yuanying-sandbox',
  };
}

async function gh(path: string, init: RequestInit = {}) {
  if (!TOKEN() || !REPO()) throw new Error('GitHub not configured');
  const res = await fetch(`https://api.github.com/repos/${REPO()}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep text for errors
  }
  if (!res.ok) {
    throw new Error(`GitHub ${res.status}: ${json?.message ?? text.slice(0, 200)}`);
  }
  return json;
}

const FORBIDDEN_PATH = /(^|\/)(\.git|node_modules|\.env[^/]*)(\/|$)|secret/i;

function safePath(p: string): string {
  const value = p.trim().replace(/^\/+/, '');
  if (!value || value.includes('..') || FORBIDDEN_PATH.test(value)) {
    throw new Error('path denied: use a relative, non-secret source path');
  }
  return value;
}

function safeBranch(b: string): string {
  const value = b.trim();
  if (!/^(agent|feat|fix)\/[A-Za-z0-9._/-]{3,120}$/.test(value)) {
    throw new Error('branch denied: use agent/<project>/<approval>-<slug>');
  }
  return value;
}

async function approved(approvalId: number, projectId: string) {
  const { data } = await supabase
    .from('work_approvals')
    .select('id, status, project_id')
    .eq('id', approvalId)
    .maybeSingle();
  if (!data) throw new Error(`approval not found: ${approvalId}`);
  if (data.project_id !== projectId) throw new Error('approval project mismatch');
  if (!['approved', 'implementing'].includes(String(data.status))) {
    throw new Error(`approval #${approvalId} is ${data.status}; approved required`);
  }
  return data;
}

export async function commitFile(args: {
  approval_id: number;
  project_id: string;
  branch: string;
  path: string;
  content: string;
  message: string;
}) {
  const approvalId = Number(args.approval_id);
  if (!Number.isInteger(approvalId) || approvalId <= 0) throw new Error('approval_id required');
  const projectId = String(args.project_id ?? '').trim();
  if (!projectId) throw new Error('project_id required');
  await approved(approvalId, projectId);
  const branch = safeBranch(String(args.branch ?? ''));
  const filePath = safePath(String(args.path ?? ''));
  const message = String(args.message ?? '').trim().slice(0, 200);
  if (!message) throw new Error('commit message required');
  if (typeof args.content !== 'string' || !args.content) throw new Error('content required');

  // Ensure branch exists, based on main's current head (no local .git).
  try {
    await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
  } catch {
    const main = await gh('/git/ref/heads/main');
    const baseSha = main?.object?.sha;
    if (!baseSha) throw new Error('cannot resolve main');
    await gh('/git/refs', {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    });
  }

  // Update an existing file with its blob sha; otherwise create.
  let existingSha: string | undefined;
  try {
    const existing = await gh(
      `/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`
    );
    if (existing?.sha) existingSha = existing.sha;
  } catch {
    // 404 = new file
  }

  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(args.content, 'utf8').toString('base64'),
    branch,
  };
  if (existingSha) body.sha = existingSha;
  const result = await gh(
    `/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`,
    { method: 'PUT', body: JSON.stringify(body) }
  );

  await supabase
    .from('work_approvals')
    .update({ status: 'implementing', updated_at: new Date().toISOString() })
    .eq('id', approvalId)
    .in('status', ['approved', 'implementing']);

  return {
    branch,
    path: filePath,
    commit_sha: result?.commit?.sha ?? null,
    commit_url: result?.commit?.html_url ?? null,
    content_url: result?.content?.html_url ?? null,
  };
}

export async function openPullRequest(args: {
  approval_id: number;
  project_id: string;
  title: string;
  body: string;
  head: string;
  base?: string;
  draft?: boolean;
}) {
  const approvalId = Number(args.approval_id);
  if (!Number.isInteger(approvalId) || approvalId <= 0) throw new Error('approval_id required');
  const projectId = String(args.project_id ?? '').trim();
  if (!projectId) throw new Error('project_id required');
  await approved(approvalId, projectId);

  const head = safeBranch(String(args.head ?? ''));
  const base = String(args.base ?? 'main').trim();
  if (base !== 'main') throw new Error('only main is allowed as base');
  const title = String(args.title ?? '').trim().slice(0, 200);
  if (!title) throw new Error('title required');

  const pr = await gh('/pulls', {
    method: 'POST',
    body: JSON.stringify({
      title,
      head,
      base,
      body: String(args.body ?? '').slice(0, 20000),
      draft: args.draft === true,
    }),
  });
  return {
    number: pr?.number ?? null,
    url: pr?.html_url ?? null,
    state: pr?.state ?? null,
    head,
    base,
  };
}

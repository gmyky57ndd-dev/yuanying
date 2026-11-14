import { randomUUID } from 'node:crypto';
import { supabase } from './db';
import { mirrorMessages } from './local-write';
import { findOrCreateIssue } from './github.ts';
import { handoffToFenshen } from './handoff.ts';
import { githubTokenForRole } from './github-token.ts';

const ROLE = 'xiaowu';
const REPO = () => process.env.GITHUB_REPO || '';

async function gh(path: string, init: RequestInit = {}) {
  const repo = REPO();
  if (!repo) throw new Error('GITHUB_REPO missing');
  const token = await githubTokenForRole(ROLE);
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'yuanying-supervisor',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${json?.message ?? text.slice(0, 200)}`);
  return json;
}

export async function createEpic(args: {
  title: string;
  body: string;
}): Promise<{ number: number; url: string; already: boolean }> {
  const title = String(args.title ?? '').trim();
  const body = String(args.body ?? '').trim();
  if (!title || !body) throw new Error('title and body required');
  const issue = await findOrCreateIssue(`[Epic] ${title}`.slice(0, 180), body, {
    role: ROLE,
  });
  return { number: issue.number, url: issue.issue_url, already: issue.already };
}

export async function listIssues(opts: {
  state?: 'open' | 'closed' | 'all';
  labels?: string;
  limit?: number;
}): Promise<
  Array<{ number: number; title: string; state: string; labels: string[]; assignees: string[]; url: string; updated_at: string }>
> {
  const state = opts.state === 'closed' ? 'closed' : opts.state === 'all' ? 'all' : 'open';
  const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 50);
  const params = new URLSearchParams({ state, per_page: String(limit) });
  if (opts.labels) params.set('labels', opts.labels);
  const rows = await gh(`/issues?${params.toString()}`);
  return (rows ?? [])
    .filter((r: any) => !r.pull_request)
    .map((r: any) => ({
      number: r.number,
      title: r.title,
      state: r.state,
      labels: (r.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name)),
      assignees: (r.assignees ?? []).map((a: any) => a.login),
      url: r.html_url,
      updated_at: r.updated_at,
    }));
}

export async function assignIssue(args: {
  issue_number: number;
  fenshen_id: 'ai_pm' | 'ai_architect' | 'dsh' | 'qa' | 'devops' | 'librarian';
  note?: string;
  assignee?: string;
  project_id?: string;
}): Promise<{
  number: number;
  label: string;
  comment_url: string | null;
  assignee: string | null;
  workpad_message_id: number | null;
}> {
  const n = Number(args.issue_number);
  if (!Number.isInteger(n) || n <= 0) throw new Error('issue_number required');
  const label = `fenshen:${args.fenshen_id}`;
  const display: Record<string, string> = {
    ai_pm: '拓维',
    ai_architect: '阿构',
    dsh: 'DSH',
    qa: '司测',
    devops: '镇岳',
    librarian: '司书',
  };
  await gh(`/issues/${n}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels: [label] }),
  });
  const body = `@${display[args.fenshen_id]} ${args.note ?? '请接手这个任务。'}\n\n_Assigned by 小悟 (Supervisor)._`;
  const comment = await gh(`/issues/${n}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  let assignee: string | null = null;
  if (args.assignee) {
    const updated = await gh(`/issues/${n}`, {
      method: 'PATCH',
      body: JSON.stringify({ assignees: [args.assignee] }),
    });
    assignee = updated?.assignees?.[0]?.login ?? args.assignee;
  }

  // A GitHub comment does NOT wake a fenshen (there is no GitHub poller that
  // invokes the LLM). Put the assignment in the Workpad room so the owner can
  // @ the assignee, and include the issue content for context.
  let workpadMessageId: number | null = null;
  if (args.project_id) {
    try {
      const issue = await gh(`/issues/${n}`);
      const content = `@${display[args.fenshen_id]} 新任务 #${n} ${issue.title}\n\n${String(
        issue.body ?? ''
      ).slice(0, 1200)}\n\n${issue.html_url}\n\n请先调用 get_github_issue(${n}) 读全文，按 Issue 正文执行；完成后在 Issue 回帖。`;
      const { data } = await supabase
        .from('messages')
        .insert({
          role: 'assistant',
          content,
          session_id: randomUUID(),
          project_id: args.project_id,
          responder_fenshen_id: 'xiaowu',
          metadata: {
            kind: 'assignment',
            issue_number: n,
            fenshen_id: args.fenshen_id,
            issue_url: issue.html_url,
          },
        })
        .select('id, role, content, session_id, project_id, responder_fenshen_id, metadata, created_at');
      if (data?.[0]) {
        workpadMessageId = data[0].id;
        mirrorMessages(data as any[]);
        // Actually wake the assignee. A GitHub comment cannot do this.
        void handoffToFenshen({
          projectId: args.project_id,
          fenshenId: args.fenshen_id,
          issueNumber: n,
          message: content,
        });
      }
    } catch (e) {
      console.warn('assignment Workpad message failed', e);
    }
  }
  return {
    number: n,
    label,
    comment_url: comment?.html_url ?? null,
    assignee,
    workpad_message_id: workpadMessageId,
  };
}

export async function commentOnIssue(args: {
  issue_number: number;
  body: string;
}): Promise<{ number: number; url: string | null }> {
  const n = Number(args.issue_number);
  const body = String(args.body ?? '').trim();
  if (!Number.isInteger(n) || n <= 0) throw new Error('issue_number required');
  if (!body) throw new Error('body required');
  const comment = await gh(`/issues/${n}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  return { number: n, url: comment?.html_url ?? null };
}

export async function updateIssueStatus(args: {
  issue_number: number;
  state: 'open' | 'closed';
}): Promise<{ number: number; state: string }> {
  const n = Number(args.issue_number);
  if (!Number.isInteger(n) || n <= 0) throw new Error('issue_number required');
  if (!['open', 'closed'].includes(args.state)) throw new Error('state must be open or closed');
  const issue = await gh(`/issues/${n}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: args.state }),
  });
  return { number: n, state: issue?.state ?? args.state };
}

export async function listPullRequests(opts: {
  state?: 'open' | 'closed' | 'all';
  limit?: number;
}): Promise<
  Array<{ number: number; title: string; state: string; head: string; base: string; url: string; updated_at: string }>
> {
  const state = opts.state === 'closed' ? 'closed' : opts.state === 'all' ? 'all' : 'open';
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const rows = await gh(`/pulls?state=${state}&per_page=${limit}`);
  return (rows ?? []).map((p: any) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    head: p.head?.ref ?? '',
    base: p.base?.ref ?? '',
    url: p.html_url,
    updated_at: p.updated_at,
  }));
}

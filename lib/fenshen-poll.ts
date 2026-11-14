import { randomUUID } from 'node:crypto';
import { supabase } from './db';
import { githubTokenForRole } from './github-token.ts';
import { mirrorMessages } from './local-write';

const IDLE_MS = 15 * 60 * 1000;
const LIGHT_MS = 30 * 60 * 1000;
const REPO = () => process.env.GITHUB_REPO || '';

type Seen = Record<
  string,
  { updated_at: string; comments: number; state: string; title: string }
>;

async function ghListIssues(role: string, label: string) {
  const repo = REPO();
  if (!repo) throw new Error('GITHUB_REPO missing');
  const token = await githubTokenForRole(role);
  const params = new URLSearchParams({
    state: 'all',
    labels: label,
    per_page: '50',
  });
  const res = await fetch(`https://api.github.com/repos/${repo}/issues?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'yuanying-idle-poll',
    },
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const rows = await res.json();
  return (rows ?? []).filter((r: any) => !r.pull_request);
}

function displayName(id: string): string {
  const map: Record<string, string> = {
    xiaowu: '小悟',
    ai_pm: '拓维',
    ai_architect: '阿构',
    dsh: 'DSH',
    qa: '司测',
    devops: '镇岳',
    librarian: '司书',
  };
  return map[id] ?? id;
}

async function lastUserMessageAt(projectId: string): Promise<number> {
  const { data } = await supabase
    .from('messages')
    .select('created_at')
    .eq('project_id', projectId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ? new Date(data.created_at).getTime() : 0;
}

async function pollOne(args: {
  projectId: string;
  fenshenId: string;
  mode: 'full' | 'light';
  force?: boolean;
}) {
  const label = `fenshen:${args.fenshenId}`;
  const issues = await ghListIssues(args.fenshenId, label);
  const { data: stateRow } = await supabase
    .from('fenshen_poll_state')
    .select('*')
    .eq('fenshen_id', args.fenshenId)
    .maybeSingle();

  const seen: Seen = (stateRow?.seen as Seen) ?? {};
  const next: Seen = { ...seen };
  const changes: string[] = [];
  const changedNumbers = new Set<number>();
  const baseline = !stateRow;

  for (const issue of issues) {
    const key = String(issue.number);
    const prev = seen[key];
    const current = {
      updated_at: String(issue.updated_at),
      comments: Number(issue.comments ?? 0),
      state: String(issue.state),
      title: String(issue.title),
    };
    next[key] = current;
    if (baseline) continue;
    if (!prev) {
      changes.push(`新指派：${label} → #${issue.number} ${current.title}`);
      changedNumbers.add(issue.number);
      continue;
    }
    if (current.comments > prev.comments) {
      changes.push(`#${issue.number} 有新评论（${prev.comments}→${current.comments}）`);
      changedNumbers.add(issue.number);
    }
    if (args.mode === 'full' && current.state !== prev.state) {
      changes.push(`#${issue.number} 状态 ${prev.state}→${current.state}`);
      changedNumbers.add(issue.number);
    }
    if (args.mode === 'full' && current.updated_at !== prev.updated_at && current.comments === prev.comments && current.state === prev.state) {
      changes.push(`#${issue.number} 有新动态`);
      changedNumbers.add(issue.number);
    }
  }

  const now = new Date().toISOString();
  if (changes.length > 0) {
    // Prefer the project that owns the issue (ledger anchor), not the first
    // room alphabetically. This fixes #168 landing in `aso` instead of the
    // room the owner was watching.
    let reportProject = args.projectId;
    if (changedNumbers.size > 0) {
      const { data: action } = await supabase
        .from('workpad_actions')
        .select('project_id')
        .in('github_issue_number', Array.from(changedNumbers))
        .limit(1)
        .maybeSingle();
      if (action?.project_id) reportProject = action.project_id;
    }
    const detail = issues
      .filter((i: any) => changedNumbers.has(Number(i.number)))
      .slice(0, 3)
      .map(
        (i: any) =>
          `#${i.number} ${i.title}\n${String(i.body ?? '').slice(0, 600)}\n${i.html_url}`
      )
      .join('\n\n');
    const content = `巡检 ${displayName(args.fenshenId)}：\n${changes
      .slice(0, 8)
      .map(c => `- ${c}`)
      .join('\n')}${detail ? `\n\n${detail}` : ''}\n\n请先调用 get_github_issue 读全文，按 Issue 正文执行。`;
    const { data: inserted } = await supabase
      .from('messages')
      .insert({
        role: 'assistant',
        content,
        session_id: randomUUID(),
        project_id: reportProject,
        responder_fenshen_id: args.fenshenId,
        metadata: {
          kind: 'idle_poll',
          fenshen_id: args.fenshenId,
          mode: args.mode,
          changes,
        },
      })
      .select('id, role, content, session_id, device_id, project_id, responder_fenshen_id, metadata, created_at');
    if (inserted) mirrorMessages(inserted as any[]);
  }

  await supabase.from('fenshen_poll_state').upsert(
    {
      fenshen_id: args.fenshenId,
      last_full_at: args.mode === 'full' ? now : stateRow?.last_full_at ?? null,
      last_light_at: now,
      seen: next,
      updated_at: now,
    },
    { onConflict: 'fenshen_id' }
  );

  return { fenshen: args.fenshenId, mode: args.mode, baseline, changes };
}

/** Runs due checks. mode is chosen per project/fenshen: idle 15m full, 30m light. */
export async function runFenshenPoll(force = false) {
  const { data: maps } = await supabase
    .from('project_fenshen_map')
    .select('project_id, fenshen_id, fenshen:fenshen_id(enabled)')
    .order('project_id');
  const byProject = new Map<string, string[]>();
  for (const row of maps ?? []) {
    if ((row as any).fenshen?.enabled === false) continue;
    const list = byProject.get((row as any).project_id) ?? [];
    list.push((row as any).fenshen_id);
    byProject.set((row as any).project_id, list);
  }

  const results: Array<Record<string, unknown>> = [];
  const now = Date.now();
  for (const [projectId, ids] of Array.from(byProject.entries())) {
    const lastUser = await lastUserMessageAt(projectId);
    const idle = !lastUser || now - lastUser >= IDLE_MS;
    for (const fenshenId of ids) {
      const { data: stateRow } = await supabase
        .from('fenshen_poll_state')
        .select('last_full_at, last_light_at')
        .eq('fenshen_id', fenshenId)
        .maybeSingle();
      const lastFull = stateRow?.last_full_at ? new Date(stateRow.last_full_at).getTime() : 0;
      const lastLight = stateRow?.last_light_at ? new Date(stateRow.last_light_at).getTime() : 0;
      const fullDue = force || (idle && now - lastFull >= IDLE_MS);
      const lightDue = force || now - lastLight >= LIGHT_MS;
      if (!fullDue && !lightDue) continue;
      try {
        results.push(
          await pollOne({
            projectId,
            fenshenId,
            mode: fullDue ? 'full' : 'light',
            force,
          })
        );
      } catch (e) {
        results.push({
          fenshen: fenshenId,
          project: projectId,
          error: e instanceof Error ? e.message : 'poll failed',
        });
      }
    }
  }
  return { checks: results.length, results };
}

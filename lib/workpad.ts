import { supabase } from './db';

export type PendingAction = {
  id: number;
  description: string;
  status: string;
};

export type ProjectIssue = {
  number: number;
  title: string;
  url: string;
  state: string;
};

/** ES-081: ONBOARDING.md is injected into every Workpad system prompt. */
export async function getOnboarding(projectId: string, cap = 2000): Promise<string> {
  const { data } = await supabase
    .from('project_docs')
    .select('content')
    .eq('project_id', projectId)
    .eq('name', 'ONBOARDING.md')
    .maybeSingle();
  return String(data?.content ?? '').slice(0, cap);
}

export async function getPendingActions(projectId: string): Promise<PendingAction[]> {
  const { data } = await supabase
    .from('workpad_actions')
    .select('id, description, status')
    .eq('project_id', projectId)
    .in('status', ['pending', 'in_progress'])
    .order('id');
  return (data ?? []) as PendingAction[];
}

/** Open GitHub issues for a project (label `project:<id>`); [] on any failure. */
export async function getProjectIssues(
  projectId: string,
  limit = 5
): Promise<ProjectIssue[]> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return [];
  try {
    const q = `repo:${repo} is:issue is:open label:project:${projectId}`;
    const res = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=${limit}&sort=updated`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'yuanying-workpad',
        },
        signal: AbortSignal.timeout(3500),
        cache: 'no-store',
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    return (data?.items ?? []).slice(0, limit).map((i: any) => ({
      number: i.number,
      title: i.title,
      url: i.html_url,
      state: i.state,
    }));
  } catch {
    return [];
  }
}

import { supabase } from './db';
import { mirrorAction } from './local-write';

/** #130: closed GitHub issue → action done (polled every 60s). */
export async function syncActionStatuses(): Promise<{
  checked: number;
  closed: number;
  errors: string[];
}> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return { checked: 0, closed: 0, errors: ['GitHub not configured'] };

  const { data, error } = await supabase
    .from('workpad_actions')
    .select('*')
    .in('status', ['pending', 'in_progress'])
    .not('github_issue_number', 'is', null)
    .order('id')
    .limit(50);
  if (error) return { checked: 0, closed: 0, errors: [error.message] };

  let checked = 0;
  let closed = 0;
  const errors: string[] = [];
  for (const action of data ?? []) {
    const number = Number((action as any).github_issue_number);
    if (!number) continue;
    checked += 1;
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues/${number}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'yuanying-action-sync',
        },
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const issue = (await res.json()) as { state?: string };
      if (issue.state !== 'closed') continue;
      const now = new Date().toISOString();
      const { data: updated, error: upErr } = await supabase
        .from('workpad_actions')
        .update({ status: 'done', result_ref: (action as any).github_issue_url, updated_at: now })
        .eq('id', (action as any).id)
        .in('status', ['pending', 'in_progress'])
        .select('*')
        .maybeSingle();
      if (upErr) throw new Error(upErr.message);
      if (updated) {
        mirrorAction(updated as any);
        closed += 1;
      }
    } catch (e) {
      errors.push(`#${number}: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }
  return { checked, closed, errors };
}

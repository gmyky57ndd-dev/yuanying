import { supabase } from './db';
import { findOrCreateIssue } from './github';

export type AgentJob = {
  id: number;
  type: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  payload: any;
  result: any;
  error: string | null;
  attempts: number;
  session_id: string | null;
};

export async function enqueuePushToDev(
  title: string,
  body: string,
  session_id?: string
): Promise<AgentJob> {
  const { data, error } = await supabase
    .from('agent_jobs')
    .insert({
      type: 'push_to_dev',
      status: 'pending',
      payload: { title, body },
      session_id: session_id ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(`job enqueue failed: ${error.message}`);
  return data as AgentJob;
}

/** ES-046: process one or more queued jobs. Called by the PWA reminder poll. */
export async function processPendingJobs(limit = 1): Promise<number> {
  const { data: jobs } = await supabase
    .from('agent_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const job of (jobs ?? []) as AgentJob[]) {
    const now = new Date().toISOString();
    const { data: claimed } = await supabase
      .from('agent_jobs')
      .update({ status: 'processing', updated_at: now })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    try {
      if (job.type !== 'push_to_dev') {
        throw new Error(`unknown job type: ${job.type}`);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      let issue;
      try {
        issue = await findOrCreateIssue(
          String(job.payload?.title ?? ''),
          String(job.payload?.body ?? ''),
          { signal: controller.signal }
        );
      } finally {
        clearTimeout(timer);
      }
      await supabase
        .from('agent_jobs')
        .update({
          status: 'done',
          result: issue,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (job.session_id) {
        await supabase.from('messages').insert({
          role: 'assistant',
          content: `后台 Issue 已创建：#${issue.number}\n\n${issue.issue_url}`,
          session_id: job.session_id,
        });
      }
      processed++;
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'job failed';
      const attempts = job.attempts + 1;
      const failed = attempts >= 3;
      await supabase
        .from('agent_jobs')
        .update({
          status: failed ? 'failed' : 'pending',
          attempts,
          error: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (failed && job.session_id) {
        await supabase.from('messages').insert({
          role: 'assistant',
          content: `后台 Issue 创建失败：${reason}`,
          session_id: job.session_id,
        });
      }
    }
  }

  return processed;
}

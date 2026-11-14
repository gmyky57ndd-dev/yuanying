import { randomUUID } from 'node:crypto';

/**
 * Agent-to-agent Workpad handoff. GitHub @ comments do NOT wake a fenshen;
 * this calls the local chat API as the assignee so it actually acts.
 * Fire-and-forget; caller should not await it on the user's critical path.
 */
export async function handoffToFenshen(args: {
  projectId: string;
  fenshenId: string;
  issueNumber: number;
  message: string;
}): Promise<void> {
  const token = process.env.API_TOKEN;
  const port = process.env.PORT || '3000';
  if (!token) {
    console.warn('handoff skipped: API_TOKEN missing');
    return;
  }
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: args.message,
        session_id: randomUUID(),
        project_id: args.projectId,
        fenshen_id: args.fenshenId,
        internal_handoff: true,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      console.warn('handoff failed', res.status, (await res.text()).slice(0, 200));
    }
  } catch (e) {
    console.warn('handoff failed', e);
  }
}

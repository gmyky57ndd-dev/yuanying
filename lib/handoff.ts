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
  requiredTools?: string[];
}): Promise<void> {
  const token = process.env.API_TOKEN;
  const port = process.env.PORT || '3000';
  if (!token) {
    console.warn('handoff skipped: API_TOKEN missing');
    return;
  }
  const required = args.requiredTools ?? [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const message =
        attempt === 1
          ? args.message
          : `${args.message}\n\n[Handoff Protocol Violation] 上一轮没有调用 ${required.join(
              ' + '
            )}。必须实际调用这些工具，不能只回复文字。`;
      const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          session_id: randomUUID(),
          project_id: args.projectId,
          fenshen_id: args.fenshenId,
          internal_handoff: true,
          handoff_tool_required: required.length > 0,
          handoff_required_tools: required,
        }),
        signal: AbortSignal.timeout(120000),
      });
      const text = await res.text();
      if (!res.ok) {
        console.warn('handoff failed', res.status, text.slice(0, 200));
        return;
      }
      if (!text.includes('Handoff Protocol Violation')) return;
      console.warn(`handoff protocol violation (attempt ${attempt})`);
    } catch (e) {
      console.warn('handoff failed', e);
      return;
    }
  }
}

import { randomUUID } from 'node:crypto';

/**
 * Agent-to-agent Workpad handoff. GitHub @ comments do NOT wake a fenshen;
 * this calls the local chat API as the assignee so it actually acts.
 *
 * Multi-tool handoffs are executed one tool per call with a forced
 * toolChoice. This avoids the "required" loop where every step must call a
 * tool (which produced duplicate assignments/comments).
 */
async function callHandoff(args: {
  projectId: string;
  fenshenId: string;
  message: string;
  requiredTool?: string;
  assignToFenshenId?: string;
  assignNote?: string;
}): Promise<void> {
  const token = process.env.API_TOKEN;
  const port = process.env.PORT || '3000';
  if (!token) {
    console.warn('handoff skipped: API_TOKEN missing');
    return;
  }
  const required = args.requiredTool ? [args.requiredTool] : [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const message =
        attempt === 1
          ? args.message
          : `${args.message}\n\n[Handoff Protocol Violation] 上一轮没有调用 ${args.requiredTool}。必须实际调用该工具，不能只回复文字。`;
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
          handoff_assign_to: args.assignToFenshenId,
          handoff_assign_note: args.assignNote,
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

export async function handoffToFenshen(args: {
  projectId: string;
  fenshenId: string;
  issueNumber: number;
  message: string;
  requiredTools?: string[];
  assignToFenshenId?: string;
  assignNote?: string;
}): Promise<void> {
  const required = args.requiredTools ?? [];
  if (required.length === 0) {
    await callHandoff({
      projectId: args.projectId,
      fenshenId: args.fenshenId,
      message: args.message,
    });
    return;
  }

  for (const tool of required) {
    const extra =
      tool === 'assign_issue'
        ? `\n\n本轮只调用 assign_issue，把 Issue #${args.issueNumber} 指派给 ${
            args.assignToFenshenId ?? '下一个分身'
          }；note: ${args.assignNote ?? '请接手' }。`
        : `\n\n本轮只调用 ${tool}，处理 Issue #${args.issueNumber}。`;
    await callHandoff({
      projectId: args.projectId,
      fenshenId: args.fenshenId,
      message: `${args.message}${extra}`,
      requiredTool: tool,
      assignToFenshenId: args.assignToFenshenId,
      assignNote: args.assignNote,
    });
  }
}

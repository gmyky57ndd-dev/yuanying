/**
 * ES-014 §3.2: format a feedback note for the dev (GitHub issue) and for an
 * external AI (clipboard block). Shared by the chat UI and feedback inbox.
 */

export type FeedbackInput = {
  text: string;
  tags?: string[];
  at?: string;
};

function day(at?: string): string {
  if (!at) return new Date().toISOString().slice(0, 10);
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? at.slice(0, 10)
    : d.toISOString().slice(0, 10);
}

export function feedbackTitle(n: FeedbackInput): string {
  const first = n.text.split('\n').find(l => l.trim()) ?? n.text;
  const t = first.trim().replace(/^#+\s*/, '');
  const clipped = t.length > 80 ? `${t.slice(0, 77)}…` : t;
  return clipped || '元婴 feedback';
}

export function formatForDev(n: FeedbackInput): string {
  const tags = (n.tags ?? []).map(t => `#${t}`).join(' ');
  return `## Problem

${n.text}

## Context

- Captured: ${day(n.at)}
- Tags: ${tags || '—'}
- Source: 元婴 feedback

---
_Sent via 元婴 → GitHub._`;
}

export function formatForAI(n: FeedbackInput): string {
  return `[YUANYING FEEDBACK]
Title: ${feedbackTitle(n)}
Body: ${n.text}
Tags: ${(n.tags ?? []).join(', ') || '—'}
Date: ${day(n.at)}
[/YUANYING FEEDBACK]`;
}

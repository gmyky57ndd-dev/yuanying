'use client';

import { useEffect, useState } from 'react';
import { fetchWithTimeout, API_BASE } from '@/lib/api';
import { formatForAI, formatForDev, feedbackTitle } from '@/lib/feedback-format';
import { FeedbackStatusBadge } from '@/components/FeedbackStatusBadge';

type Item = {
  id: number;
  text: string;
  tags: string[];
  promoted: boolean;
  status: 'new' | 'inbox' | 'pushed' | 'resolved';
  issue_url: string | null;
  date: string;
  at: string;
};

/** ES-012 §3 / ES-018: Feedback Inbox with status + delivery actions. */
export default function FeedbackPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushingId, setPushingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/feedback`, {});
      const d = await r.json();
      setItems(d.items ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(id: number, body: Record<string, unknown>) {
    try {
      await fetchWithTimeout(`${API_BASE}/api/note/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      load();
    } catch {}
  }

  // ES-014 / ES-018: feedback forwarding.
  async function copyForAI(it: Item) {
    try {
      await navigator.clipboard.writeText(
        formatForAI({ text: it.text, tags: it.tags, at: it.at })
      );
      alert('已复制（Copy as Text）');
    } catch {
      alert('复制失败');
    }
  }

  async function pushToDev(it: Item) {
    if (it.issue_url || pushingId === it.id) return;
    setPushingId(it.id);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/integrations/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[元婴 feedback] ${feedbackTitle(it)}`,
          body: formatForDev({ text: it.text, tags: it.tags, at: it.at }),
          note_id: it.id,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // ES-017/ES-018: fallback to clipboard when GitHub is not configured.
        try {
          await navigator.clipboard.writeText(
            formatForDev({ text: it.text, tags: it.tags, at: it.at })
          );
          alert('GitHub token missing, copied to clipboard instead.');
        } catch {
          alert(`GitHub: ${d.error ?? r.status}`);
        }
        return;
      }
      const url: string | undefined = d.issue_url;
      try {
        if (url) await navigator.clipboard.writeText(url);
      } catch {}
      alert(
        `${d.already ? 'Already sent!' : 'Issue created!'}${url ? `\n${url}` : ''}`
      );
      load();
    } catch {
      alert('GitHub 失败');
    } finally {
      setPushingId(null);
    }
  }

  async function saveToInbox(it: Item) {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/integrations/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: it.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`Inbox: ${d.error ?? r.status}`);
        return;
      }
      alert(`已提交到 inbox\n${d.path ?? ''}`);
      load();
    } catch {
      alert('Inbox 提交失败');
    }
  }

  return (
    <div className="min-h-[100dvh] bg-stone-950 text-stone-100 px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <a href="/" className="text-xs text-stone-400">
          ← 首页
        </a>
        <div className="text-sm text-stone-300">反馈收件箱</div>
      </div>

      <p className="text-[12px] text-stone-500 mb-4">
        「发送」动作会改变反馈状态并通知 Dev；「本地」动作只复制文本，不改状态、
        不通知 Dev。Save to Inbox 提交文件到 docs/pm/inbox/；Push to GitHub
        立刻创建 Issue；Mark Resolved 标记已处理。
      </p>

      {loading ? (
        <div className="text-xs text-stone-600">加载中…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-stone-600">还没有反馈。</div>
      ) : (
        <ul className="space-y-3">
          {items.map(it => (
            <li key={it.id} className="border border-stone-900 rounded-xl p-3">
              <div className="flex items-center gap-2 text-[11px] text-stone-600 mb-1">
                <span>{it.date}</span>
                <FeedbackStatusBadge status={it.status} />
                {it.issue_url && (
                  <a
                    href={it.issue_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-stone-400 underline"
                  >
                    issue
                  </a>
                )}
              </div>
              <div className="text-[13px] text-stone-200 whitespace-pre-wrap break-words">
                {it.text}
              </div>
              {it.tags.length > 0 && (
                <div className="text-[11px] text-stone-500 mt-1">
                  {it.tags.map(t => `#${t}`).join(' ')}
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <span className="text-[10px] uppercase tracking-wider text-stone-600">
                  发送
                </span>
                <button
                  onClick={() => pushToDev(it)}
                  disabled={
                    !!it.issue_url ||
                    pushingId === it.id ||
                    it.status === 'resolved'
                  }
                  className="text-[11px] bg-stone-800 rounded-full px-3 py-1 disabled:opacity-40"
                  title={it.issue_url ? 'Already sent' : undefined}
                >
                  {it.status === 'resolved'
                    ? 'Resolved'
                    : it.issue_url
                      ? 'Pushed'
                      : pushingId === it.id
                        ? 'Pushing…'
                        : 'Push to GitHub'}
                </button>
                {it.status === 'new' && (
                  <button
                    onClick={() => saveToInbox(it)}
                    className="text-[11px] bg-stone-700 rounded-full px-3 py-1"
                  >
                    Save to Inbox
                  </button>
                )}
                {(it.status === 'inbox' || it.status === 'pushed') && (
                  <button
                    onClick={() => patch(it.id, { feedback_status: 'resolved' })}
                    className="text-[11px] bg-stone-700 rounded-full px-3 py-1"
                  >
                    Mark Resolved
                  </button>
                )}
                <span className="mx-1 h-4 w-px bg-stone-800" aria-hidden />
                <span className="text-[10px] uppercase tracking-wider text-stone-600">
                  本地
                </span>
                <button
                  onClick={() => copyForAI(it)}
                  className="text-[11px] border border-stone-800 text-stone-400 rounded-full px-3 py-1"
                  title="仅复制到剪贴板，不改变状态，也不通知 Dev"
                >
                  Copy as Text
                </button>
                <button
                  onClick={() => patch(it.id, { feedback: false })}
                  className="text-[11px] text-stone-500 px-2"
                >
                  dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

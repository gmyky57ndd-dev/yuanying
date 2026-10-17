'use client';

import { useEffect, useState } from 'react';
import { fetchWithTimeout, API_BASE } from '@/lib/api';
import { formatForAI, formatForDev, feedbackTitle } from '@/lib/feedback-format';

type Item = {
  id: number;
  text: string;
  tags: string[];
  promoted: boolean;
  date: string;
  at: string;
};

/** ES-012 §3: Feedback Inbox — pre-PM staging, one-way owner → dev. */
export default function FeedbackPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

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

  // ES-014: feedback forwarding.
  async function copyForAI(it: Item) {
    try {
      await navigator.clipboard.writeText(
        formatForAI({ text: it.text, tags: it.tags, at: it.at })
      );
      alert('已复制（Copy for AI）');
    } catch {
      alert('复制失败');
    }
  }
  async function pushToDev(it: Item) {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/integrations/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[元婴 feedback] ${feedbackTitle(it)}`,
          body: formatForDev({ text: it.text, tags: it.tags, at: it.at }),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // ES-016: fallback to clipboard when GitHub is not configured.
        try {
          await navigator.clipboard.writeText(
            formatForDev({ text: it.text, tags: it.tags, at: it.at })
          );
          alert(
            `GitHub 未配置或失败（${d.error ?? r.status}），已复制 issue 内容`
          );
        } catch {
          alert(`GitHub: ${d.error ?? r.status}`);
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(d.url);
      } catch {}
      alert(`Issue #${d.number} created (link copied)`);
    } catch {
      alert('GitHub 失败');
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
        每周过一遍。promote 会写入 docs/pm/inbox/；dismiss 只是取消标记。
      </p>

      {loading ? (
        <div className="text-xs text-stone-600">加载中…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-stone-600">还没有反馈。</div>
      ) : (
        <ul className="space-y-3">
          {items.map(it => (
            <li key={it.id} className="border border-stone-900 rounded-xl p-3">
              <div className="text-[11px] text-stone-600 mb-1">{it.date}</div>
              <div className="text-[13px] text-stone-200 whitespace-pre-wrap break-words">
                {it.text}
              </div>
              {it.tags.length > 0 && (
                <div className="text-[11px] text-stone-500 mt-1">
                  {it.tags.map(t => `#${t}`).join(' ')}
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <button
                  onClick={() => pushToDev(it)}
                  className="text-[11px] bg-stone-800 rounded-full px-3 py-1"
                >
                  Push to Dev
                </button>
                <button
                  onClick={() => copyForAI(it)}
                  className="text-[11px] bg-stone-800 rounded-full px-3 py-1"
                >
                  Copy for AI
                </button>
                {it.promoted ? (
                  <span className="text-[11px] text-emerald-500">
                    已存入收件箱 → docs/pm/inbox/{it.date}.md
                  </span>
                ) : (
                  <button
                    onClick={() => patch(it.id, { promoted: true })}
                    className="text-[11px] bg-stone-700 rounded-full px-3 py-1"
                  >
                    Save to Inbox
                  </button>
                )}
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

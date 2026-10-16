'use client';

import { useEffect, useState } from 'react';
import { fetchWithTimeout, API_BASE } from '@/lib/api';

/**
 * ES-010 §2: mobile share target ("Send to 元婴") + manual paste. Rides on the
 * OS share sheet — no new capture surface inside the PWA shell beyond this
 * one form, which is the share destination itself.
 */
export default function ImportPage() {
  const [text, setText] = useState('');
  const [context, setContext] = useState('');
  const [ai, setAi] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = [p.get('title'), p.get('text'), p.get('url')]
      .filter(Boolean)
      .join('\n\n');
    if (t) setText(t);
  }, []);

  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context, ai, source: 'share' }),
      });
      if (!r.ok) {
        setError('保存失败');
        return;
      }
      setDone(true);
    } catch {
      setError('连接失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-stone-950 text-stone-100 px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <a href="/" className="text-xs text-stone-400">
          ← 首页
        </a>
        <div className="text-sm text-stone-300">发给我</div>
      </div>

      {done ? (
        <div className="text-sm text-stone-300">
          <p>记下了。</p>
          <a href="/" className="text-stone-500 text-xs">
            返回首页
          </a>
        </div>
      ) : (
        <>
          <p className="text-[12px] text-stone-500 mb-3">
            粘贴 AI 的摘要，或它给自己写的对话记录。不用整理，我来读。
          </p>
          <input
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="一句话背景（可选）"
            className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm mb-2 outline-none focus:border-stone-600"
          />
          <input
            value={ai}
            onChange={e => setAi(e.target.value)}
            placeholder="哪个 AI（可选，如 Claude / ChatGPT）"
            className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm mb-2 outline-none focus:border-stone-600"
          />
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={10}
            lang="zh-CN"
            inputMode="text"
            autoComplete="off"
            placeholder="对话记录 / 摘要…"
            className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-stone-600"
          />
          {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
          <div className="flex justify-end mt-3">
            <button
              onClick={save}
              disabled={!text.trim() || saving}
              className="bg-stone-700 disabled:opacity-40 rounded-full px-5 py-2 text-sm"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

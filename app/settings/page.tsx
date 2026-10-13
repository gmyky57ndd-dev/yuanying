'use client';
import { useState, useEffect } from 'react';
import { fetchWithTimeout } from '@/lib/api';

export default function Settings() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout('/api/config', {})
      .then(r => r.json())
      .then(d => {
        setEnabled(d.activity_collection_enabled);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    await fetchWithTimeout('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_collection_enabled: next }),
    });
  }

  if (loading) return <div className="p-4">加载中…</div>;

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <a href="/" className="text-xs text-stone-500">
          ← 返回
        </a>
        <h1 className="text-lg">设置</h1>
      </div>
      <div className="flex justify-between items-center">
        <span>活动数据采集</span>
        <button
          onClick={toggle}
          className={`w-12 h-6 rounded-full transition-colors ${
            enabled ? 'bg-emerald-700' : 'bg-stone-700'
          }`}
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-stone-500 mt-2">
        关闭后，Android 采集器将停止上报。数据仅用于元婴自身的分析，不外传。
      </p>
    </div>
  );
}

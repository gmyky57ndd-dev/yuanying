'use client';
import { useState, useEffect } from 'react';
import { fetchWithTimeout, API_BASE } from '@/lib/api';

type Reminders = { water: boolean; standup: boolean; vitamin: boolean };
type Habit = {
  name: string;
  display_name: string | null;
  type: string;
  reminder: { mode?: string; times?: string[]; interval_min?: number } | null;
};

export default function Settings() {
  const [enabled, setEnabled] = useState(true);
  const [reminders, setReminders] = useState<Reminders>({
    water: true,
    standup: true,
    vitamin: true,
  });
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout(`${API_BASE}/api/config`, {})
      .then(r => r.json())
      .then(d => {
        setEnabled(d.activity_collection_enabled ?? true);
        setReminders({
          water: true,
          standup: true,
          vitamin: true,
          ...(d.reminders_enabled ?? {}),
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetchWithTimeout(`${API_BASE}/api/habits`, {})
      .then(r => r.json())
      .then(d => setHabits(d.habits ?? []))
      .catch(() => {});
  }, []);

  async function toggleActivity() {
    const next = !enabled;
    setEnabled(next);
    await fetchWithTimeout(`${API_BASE}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_collection_enabled: next }),
    });
  }

  async function toggleReminder(name: keyof Reminders) {
    const next = { ...reminders, [name]: !reminders[name] };
    setReminders(next);
    await fetchWithTimeout(`${API_BASE}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminders_enabled: next }),
    });
  }

  if (loading) return <div className="p-4">加载中…</div>;

  const reminderRows: Array<{ key: keyof Reminders; label: string }> = [
    { key: 'water', label: '喝水提醒（10:30 / 15:30 / 20:00）' },
    { key: 'standup', label: '起身提醒（每小时，久坐后）' },
    { key: 'vitamin', label: '维生素提醒（08:30）' },
  ];

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
          onClick={toggleActivity}
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
      <p className="text-xs text-stone-500 mt-2 leading-relaxed">
        关闭后，Android 采集器会在下一次运行时停止上报，已有数据保留。
      </p>

      <div className="mt-6 border-t border-stone-800 pt-4">
        <h2 className="text-sm text-stone-300 mb-3">语音提醒</h2>
        <div className="space-y-3">
          {reminderRows.map(row => (
            <div key={row.key} className="flex justify-between items-center gap-3">
              <span className="text-sm">{row.label}</span>
              <button
                onClick={() => toggleReminder(row.key)}
                className={`w-12 h-6 rounded-full shrink-0 transition-colors ${
                  reminders[row.key] ? 'bg-emerald-700' : 'bg-stone-700'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                    reminders[row.key] ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-stone-800 pt-4">
        <h2 className="text-sm text-stone-300 mb-3">管理习惯（只读）</h2>
        <ul className="text-xs text-stone-400 space-y-2">
          {habits.map(h => (
            <li key={h.name} className="flex justify-between gap-3">
              <span>{h.display_name || h.name}</span>
              <span className="text-stone-500">
                {h.reminder?.mode === 'interval'
                  ? `每 ${h.reminder.interval_min} 分钟`
                  : h.reminder?.times?.join(' / ') ?? '—'}
              </span>
            </li>
          ))}
          {habits.length === 0 && <li className="text-stone-600">暂无</li>}
        </ul>
        <p className="text-[11px] text-stone-600 mt-2">
          新增/编辑习惯将在 v1.1 提供。
        </p>
      </div>

      <div className="mt-6 border-t border-stone-800 pt-4">
        <h2 className="text-sm text-stone-300 mb-2">隐私说明</h2>
        <ul className="text-xs text-stone-500 leading-relaxed space-y-1 list-disc pl-4">
          <li>采集内容：仅手机前台应用的使用时长（包名、名称、分钟数），不含消息、位置、照片或键盘输入。</li>
          <li>数据去向：直接写入你自己的 Supabase（Postgres），经 HTTPS 传输，不经过任何第三方服务器。</li>
          <li>用途：仅供元婴理解你的作息与注意力，用于对话时参考，不用于广告或对外分析。</li>
          <li>控制权：可随时用上方开关暂停采集；数据可在 Supabase 中随时查询、导出或删除。</li>
          <li>权限：需在系统「使用情况访问」中手动授予，可随时撤销。</li>
        </ul>
        <a href="/privacy" className="inline-block mt-3 text-xs text-emerald-400">
          查看完整隐私政策 →
        </a>
      </div>
    </div>
  );
}

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
type FenshenItem = { id: string; display_name: string; avatar_url: string | null };
type ModelItem = {
  id: string;
  provider: string;
  model_name: string;
  base_url: string | null;
  has_api_key: boolean;
};

const MODEL_PROVIDERS = ['deepseek', 'openai', 'anthropic', 'custom'];

export default function Settings() {
  const [enabled, setEnabled] = useState(true);
  const [reminders, setReminders] = useState<Reminders>({
    water: true,
    standup: true,
    vitamin: true,
  });
  const [habits, setHabits] = useState<Habit[]>([]);
  const [fenshen, setFenshen] = useState<FenshenItem[]>([]);
  const [activeFenshen, setActiveFenshen] = useState('');
  const [models, setModels] = useState<ModelItem[]>([]);
  const [activeModel, setActiveModel] = useState('');
  const [modelForm, setModelForm] = useState({
    provider: 'deepseek',
    model_name: '',
    api_key: '',
    base_url: '',
  });
  const [modelSaving, setModelSaving] = useState(false);
  const [modelMessage, setModelMessage] = useState<string | null>(null);
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
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
    fetchWithTimeout(`${API_BASE}/api/fenshen`, {})
      .then(r => r.json())
      .then(d => {
        setFenshen(d.fenshen ?? []);
        setActiveFenshen(d.active ?? '');
      })
      .catch(() => {});
    loadModels();
  }, []);

  async function loadModels() {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/models`, {});
      const d = await r.json();
      setModels(d.models ?? []);
      setActiveModel(d.active ?? '');
    } catch {}
  }

  async function switchModel(id: string) {
    const previous = activeModel;
    setActiveModel(id);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/models`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_model_id: id }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setModelMessage(d.error ?? '切换失败');
        setActiveModel(previous);
      }
    } catch {
      setModelMessage('切换失败');
      setActiveModel(previous);
    }
  }

  async function addModel(e: any) {
    e.preventDefault();
    if (modelSaving) return;
    setModelSaving(true);
    setModelMessage(null);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelForm),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setModelMessage(d.error ?? '添加失败');
        return;
      }
      setModelForm({
        provider: 'deepseek',
        model_name: '',
        api_key: '',
        base_url: '',
      });
      setModelMessage('已保存');
      await loadModels();
    } catch {
      setModelMessage('添加失败');
    } finally {
      setModelSaving(false);
    }
  }

  async function deleteModel(id: string) {
    if (!window.confirm(`删除模型 ${id}？`)) return;
    try {
      const r = await fetchWithTimeout(
        `${API_BASE}/api/models?id=${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setModelMessage(d.error ?? '删除失败');
        return;
      }
      setModelMessage(null);
      await loadModels();
    } catch {
      setModelMessage('删除失败');
    }
  }

  async function testModel(id: string) {
    setTestingModel(id);
    setTestResults(prev => ({ ...prev, [id]: '' }));
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/models/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await r.json().catch(() => ({}));
      setTestResults(prev => ({
        ...prev,
        [id]: d.success ? `可用：${d.reply || 'ok'}` : `失败：${d.error ?? '未知错误'}`,
      }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [id]: `失败：${err instanceof Error ? err.message : '网络错误'}`,
      }));
    } finally {
      setTestingModel(null);
    }
  }

  async function switchFenshen(id: string) {
    setActiveFenshen(id);
    await fetchWithTimeout(`${API_BASE}/api/fenshen`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  }

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

      <div className="mb-6">
        <label htmlFor="fenshen" className="text-sm text-stone-300 block mb-2">
          分身
        </label>
        <select
          id="fenshen"
          value={activeFenshen}
          onChange={e => switchFenshen(e.target.value)}
          className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm"
        >
          {fenshen.map(f => (
            <option key={f.id} value={f.id}>
              {f.display_name} ({f.id})
            </option>
          ))}
        </select>
        <p className="text-[11px] text-stone-600 mt-1">
          切换立即生效，下一条消息用新分身。也可在聊天输入 /fenshen &lt;name&gt;。
        </p>
      </div>

      <div className="mt-6 border-t border-stone-800 pt-4">
        <h2 className="text-sm text-stone-300 mb-1">模型</h2>
        <p className="text-[11px] text-stone-600 mb-3">
          聊天使用选中的模型。API Key 只保存在服务端，不会返回到浏览器。
        </p>

        <div className="space-y-2">
          {models.map(m => (
            <div
              key={m.id}
              className="rounded-xl border border-stone-800 bg-stone-900/40 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <label className="flex items-start gap-2 min-w-0">
                  <input
                    type="radio"
                    name="active-model"
                    checked={activeModel === m.id}
                    onChange={() => switchModel(m.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm truncate">
                      {m.model_name}
                    </span>
                    <span className="block text-[11px] text-stone-500 truncate">
                      {m.provider}
                      {m.base_url ? ` · ${m.base_url}` : ''}
                      {m.has_api_key ? '' : ' · env key'}
                    </span>
                  </span>
                </label>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => testModel(m.id)}
                    disabled={testingModel === m.id}
                    className="text-[11px] px-2 py-1 rounded-lg border border-stone-700 text-stone-300 disabled:opacity-50"
                  >
                    {testingModel === m.id ? '测试中…' : '测试'}
                  </button>
                  <button
                    onClick={() => deleteModel(m.id)}
                    disabled={activeModel === m.id}
                    className="text-[11px] px-2 py-1 rounded-lg border border-stone-700 text-stone-500 disabled:opacity-40"
                  >
                    删除
                  </button>
                </div>
              </div>
              {testResults[m.id] && (
                <p
                  className={`text-[11px] mt-2 ${
                    testResults[m.id].startsWith('可用')
                      ? 'text-emerald-400'
                      : 'text-red-400'
                  }`}
                >
                  {testResults[m.id]}
                </p>
              )}
            </div>
          ))}
          {models.length === 0 && (
            <p className="text-[11px] text-stone-600">暂无模型</p>
          )}
        </div>

        <form onSubmit={addModel} className="mt-4 space-y-2">
          <div className="flex gap-2">
            <select
              value={modelForm.provider}
              onChange={e =>
                setModelForm(f => ({ ...f, provider: e.target.value }))
              }
              className="w-32 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm"
            >
              {MODEL_PROVIDERS.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              value={modelForm.model_name}
              onChange={e =>
                setModelForm(f => ({ ...f, model_name: e.target.value }))
              }
              placeholder="模型名，例如 gpt-4o"
              className="flex-1 min-w-0 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <input
            type="password"
            value={modelForm.api_key}
            onChange={e =>
              setModelForm(f => ({ ...f, api_key: e.target.value }))
            }
            placeholder="API Key（留空则用服务端环境变量）"
            className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm"
          />
          <input
            value={modelForm.base_url}
            onChange={e =>
              setModelForm(f => ({ ...f, base_url: e.target.value }))
            }
            placeholder={
              modelForm.provider === 'custom'
                ? 'Base URL（必填，例如 http://localhost:11434/v1）'
                : 'Base URL（可选）'
            }
            className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={modelSaving || !modelForm.model_name.trim()}
              className="text-xs px-3 py-2 rounded-xl bg-emerald-800 text-white disabled:opacity-50"
            >
              {modelSaving ? '保存中…' : '添加模型'}
            </button>
            {modelMessage && (
              <span className="text-[11px] text-stone-400">{modelMessage}</span>
            )}
          </div>
        </form>
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

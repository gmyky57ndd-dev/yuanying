'use client';
import { useState, useEffect } from 'react';
import { fetchWithTimeout, API_BASE } from '@/lib/api';
import { APP_VERSION } from '@/lib/app-version';

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
type DriveStatus = {
  configured: boolean;
  connected: boolean;
  updated_at: string | null;
  scope: string | null;
};
type CollectorStatus = {
  installed_version: string | null;
  installed_code: number | null;
  last_report_at: string | null;
  last_signal_at: string | null;
  latest_version: string | null;
  update_available: boolean;
  update_url: string;
  overlay_active: boolean;
  online: boolean;
  steps_status: string | null;
  steps_at: string | null;
  steps_value: number | null;
  steps_records: number | null;
  steps_error: string | null;
};

const PWA_VERSION = APP_VERSION;

const MODEL_PROVIDERS = ['deepseek', 'openai', 'anthropic', 'custom'];

export default function Settings() {
  const [enabled, setEnabled] = useState(true);
  const [verboseTools, setVerboseTools] = useState(false);
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
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [collector, setCollector] = useState<CollectorStatus | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [externalMessage, setExternalMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout(`${API_BASE}/api/config`, {})
      .then(r => r.json())
      .then(d => {
        setEnabled(d.activity_collection_enabled ?? true);
        setVerboseTools(d.tool_readback_enabled === true);
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
    loadDrive();
    loadCollector();
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true
    );
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('drive');
    if (!result) return;

    const messages: Record<string, string> = {
      connected: 'Google Drive 已连接。',
      denied: 'Google Drive 授权被取消。',
      invalid_state: '授权校验失败，请重试。',
      not_configured: '服务端还没有配置 Google OAuth。',
      error: 'Google Drive 授权失败，请重试。',
    };
    setDriveMessage(messages[result] ?? 'Google Drive 状态未知。');
    window.history.replaceState({}, '', '/settings');
  }, []);

  async function loadCollector() {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/health`, {
        cache: 'no-store',
      });
      const d = await r.json();
      setCollector(d);
    } catch {}
  }

  async function requestCollectorSync() {
    setSyncMessage(null);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collector_sync_requested_at: new Date().toISOString(),
        }),
      });
      setSyncMessage(
        r.ok
          ? '已请求同步；采集器会在下次后台唤醒时执行。'
          : '同步请求失败'
      );
      if (r.ok) setTimeout(loadCollector, 30000);
    } catch {
      setSyncMessage('同步请求失败');
    }
  }

  async function ingestClipboard() {
    setExternalMessage(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setExternalMessage('剪贴板是空的。');
        return;
      }
      const r = await fetchWithTimeout(`${API_BASE}/api/external-chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'clipboard', content: text }),
      });
      const d = await r.json().catch(() => ({}));
      setExternalMessage(
        r.ok ? `已吸收 ${d?.data?.chars ?? text.length} 字到外部记忆。` : '吸收失败'
      );
    } catch {
      setExternalMessage('无法读取剪贴板');
    }
  }

  async function checkPwaUpdate() {
    if (!('serviceWorker' in navigator)) {
      alert('此浏览器不支持 Service Worker');
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      alert('Service Worker 未注册');
      return;
    }
    await reg.update();
    if (reg.waiting) {
      if (window.confirm('发现新版本，立即刷新？')) window.location.reload();
    } else {
      alert('已检查，当前已是最新版本。');
    }
  }

  async function addToHome() {
    const prompt = (window as any).__yyInstallPrompt;
    if (prompt?.prompt) {
      prompt.prompt();
      await prompt.userChoice?.catch?.(() => {});
      (window as any).__yyInstallPrompt = null;
      return;
    }
    alert(
      '请用手机浏览器打开 https://yuanying-rust.vercel.app，然后在浏览器菜单中选择「添加到主屏幕」。'
    );
  }

  async function loadDrive() {
    try {
      const r = await fetchWithTimeout(
        `${API_BASE}/api/integrations/google-drive`,
        {}
      );
      const d = await r.json();
      setDrive(d);
    } catch {}
  }

  async function disconnectDrive() {
    if (!window.confirm('断开 Google Drive？元婴将无法再读取 Drive 文档。')) {
      return;
    }
    setDriveMessage(null);
    try {
      const r = await fetchWithTimeout(
        `${API_BASE}/api/integrations/google-drive`,
        { method: 'DELETE' }
      );
      if (!r.ok) {
        setDriveMessage('断开失败');
        return;
      }
      setDriveMessage('已断开。');
      await loadDrive();
    } catch {
      setDriveMessage('断开失败');
    }
  }

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/export`, {});
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setExportMessage(
          r.status === 401 ? '需要先登录' : d.error ?? '导出失败'
        );
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yuanying-export-${new Date()
        .toISOString()
        .slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Safari/WebKit cancels a blob download if the URL is revoked immediately.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      const name = a.download;
      setExportMessage(
        `已生成 ${name}。macOS 会静默保存到「下载」文件夹（⌘⇧L 打开）；若没看到文件，检查浏览器是否拦截了下载。`
      );
    } catch {
      setExportMessage('导出失败');
    } finally {
      setExporting(false);
    }
  }

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

  async function toggleVerboseTools() {
    const next = !verboseTools;
    setVerboseTools(next);
    await fetchWithTimeout(`${API_BASE}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_readback_enabled: next }),
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
        <h2 className="text-sm text-stone-300 mb-2">采集器与客户端</h2>
        <div className="text-xs text-stone-400 space-y-2">
          <div className="flex justify-between gap-3">
            <span className="text-stone-500">采集器版本</span>
            <span>
              {collector?.installed_version
                ? `v${collector.installed_version}${
                    collector.installed_code
                      ? ` (${collector.installed_code})`
                      : ''
                  }`
                : '未上报'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-stone-500">最后上报</span>
            <span>
              {collector?.last_report_at || collector?.last_signal_at
                ? new Date(
                    collector.last_report_at ||
                      collector.last_signal_at ||
                      ''
                  ).toLocaleString()
                : '没有记录'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-stone-500">步数同步</span>
            <span className={collector?.steps_status === 'ok' ? '' : 'text-amber-500'}>
              {collector?.steps_at
                ? `${new Date(collector.steps_at).toLocaleTimeString()} · ${
                    collector.steps_status ?? 'unknown'
                  }${collector.steps_value != null ? ` · ${collector.steps_value} 步` : ''}`
                : '未上报'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-stone-500">后台采集</span>
            <span className={collector?.online ? 'text-emerald-400' : 'text-amber-500'}>
              {collector?.online ? '在线' : '已停止'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-stone-500">悬浮元婴</span>
            <span>{collector?.overlay_active ? '开启' : '关闭'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-stone-500">PWA 版本</span>
            <span>{PWA_VERSION}</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => {
                window.localStorage.setItem('yy_diag', '1');
                alert('输入法诊断已开启。回到聊天页并点一次输入框，右上角会显示事件记录。');
              }}
              className="text-xs px-3 py-2 rounded-xl bg-stone-800 text-stone-300"
            >
              输入法诊断
            </button>
            <button
              onClick={() => {
                window.localStorage.removeItem('yy_diag');
                alert('输入法诊断已关闭。');
              }}
              className="text-xs px-3 py-2 rounded-xl bg-stone-800 text-stone-300"
            >
              关闭诊断
            </button>
            <button
              onClick={requestCollectorSync}
              className="text-xs px-3 py-2 rounded-xl bg-stone-800 text-stone-200"
            >
              立即同步采集器
            </button>
            <button
              onClick={checkPwaUpdate}
              className="text-xs px-3 py-2 rounded-xl bg-stone-800 text-stone-200"
            >
              检查 PWA 更新
            </button>
          </div>
          {syncMessage && (
            <p className="text-[11px] text-stone-500">{syncMessage}</p>
          )}
          {collector?.update_available && (
            <a
              href={collector.update_url}
              className="inline-block text-xs px-3 py-2 rounded-xl bg-emerald-800 text-white"
            >
              有新版本 v{collector.latest_version}，去更新
            </a>
          )}
          {isStandalone ? (
            <p className="text-[11px] text-emerald-500">
              当前已在主屏幕模式运行。
            </p>
          ) : (
            <button
              onClick={addToHome}
              className="text-xs px-3 py-2 rounded-xl bg-stone-800 text-stone-200"
            >
              添加到主屏幕
            </button>
          )}
          <p className="text-[11px] text-stone-600 leading-relaxed">
            图标被删除后，用手机浏览器打开
            https://yuanying-rust.vercel.app，再选择「添加到主屏幕」。
          </p>
        </div>
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

      <div className="mt-6 border-t border-stone-800 pt-4">
        <h2 className="text-sm text-stone-300 mb-1">Google Drive（只读）</h2>
        <p className="text-[11px] text-stone-600 mb-3">
          授权后，可以在聊天里发 Drive 链接，让我读入并保存为笔记。只读，不写、不删、不分享。
        </p>

        {!drive?.configured ? (
          <p className="text-[11px] text-amber-500">
            服务端未配置 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET。
          </p>
        ) : drive?.connected ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-emerald-400">
              已连接 · 只读权限
              {drive.updated_at
                ? ` · ${new Date(drive.updated_at).toLocaleDateString()}`
                : ''}
            </span>
            <button
              onClick={disconnectDrive}
              className="text-[11px] px-2 py-1 rounded-lg border border-stone-700 text-stone-400"
            >
              断开
            </button>
          </div>
        ) : (
          <a
            href={`${API_BASE}/api/integrations/google-drive/authorize`}
            className="inline-block text-xs px-3 py-2 rounded-xl bg-emerald-800 text-white"
          >
            授权 Google Drive
          </a>
        )}

        {driveMessage && (
          <p className="text-[11px] text-stone-400 mt-2">{driveMessage}</p>
        )}
      </div>

      <div className="mt-6 border-t border-stone-800 pt-4">
        <h2 className="text-sm text-stone-300 mb-1">外部 AI 记忆</h2>
        <p className="text-[11px] text-stone-600 mb-3">
          把 Mac 剪贴板里的外部 AI 对话吸收到长期记忆。也可以在 PWA 按 Cmd+Shift+V。
        </p>
        <button
          onClick={ingestClipboard}
          className="text-xs px-3 py-2 rounded-xl bg-emerald-800 text-white"
        >
          吸收剪贴板
        </button>
        {externalMessage && (
          <p className="text-[11px] text-stone-400 mt-2">{externalMessage}</p>
        )}
      </div>

      <div className="mt-6 border-t border-stone-800 pt-4">
        <h2 className="text-sm text-stone-300 mb-1">数据主权</h2>
        <p className="text-[11px] text-stone-600 mb-3">
          导出数据库和 core/ 记忆。API key 和 Google token 不会包含在 ZIP 里。
        </p>
        <button
          onClick={exportData}
          disabled={exporting}
          className="text-xs px-3 py-2 rounded-xl bg-emerald-800 text-white disabled:opacity-50"
        >
          {exporting ? '正在打包…' : '导出我的元婴'}
        </button>
        {exportMessage && (
          <p className="text-[11px] text-stone-400 mt-2">{exportMessage}</p>
        )}
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

      <div className="mt-4 flex justify-between items-center">
        <div>
          <div className="text-sm">详细工具输出</div>
          <div className="text-[11px] text-stone-500">
            Verbose Tool Output · 开启后会返回完整工具结果，默认只汇报结论。
          </div>
        </div>
        <button
          onClick={toggleVerboseTools}
          className={`w-12 h-6 rounded-full shrink-0 transition-colors ${
            verboseTools ? 'bg-emerald-700' : 'bg-stone-700'
          }`}
          aria-label="toggle verbose tool output"
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white transition-transform ${
              verboseTools ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

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

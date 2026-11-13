'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Project = { id: string; name: string; description: string | null; last_message: string | null; open_goals: number };
type Fenshen = { id: string; display_name: string; enabled?: boolean; has_all_tools?: boolean };
type Activity = { id: number; role: string; project_id: string | null; snippet: string; at: string };
type Doc = { project_id: string; name: string; chars: number; updated_at: string };
type Wiki = { name: string; size: number; updated_at: string };
type Hub = {
  date: string;
  steps: { value: number } | null;
  water: number;
  water_goal: number;
  sleep: { value: any } | null;
  projects: Project[];
  activity: Activity[];
  docs: Doc[];
  wiki: Wiki[];
  wiki_dir: string;
};

const tabs = [
  { id: 'home', label: '首页' },
  { id: 'sandbox', label: '沙箱设计' },
  { id: 'settings', label: '设置' },
] as const;
type Tab = (typeof tabs)[number]['id'];

function fmt(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function DesktopPage() {
  const [tab, setTab] = useState<Tab>('home');
  const [hub, setHub] = useState<Hub | null>(null);
  const [fenshen, setFenshen] = useState<Fenshen[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState('ai_pm');
  const [editPrompt, setEditPrompt] = useState('');
  const [editTools, setEditTools] = useState<string[]>([]);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editAllTools, setEditAllTools] = useState(true);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, f] = await Promise.all([
        fetch('/api/hub', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/fenshen/config', { cache: 'no-store' }).then(r => r.json()),
      ]);
      setHub(h);
      setFenshen(Array.isArray(f?.fenshen) ? f.fenshen : []);
      setTools(Array.isArray(f?.tools) ? f.tools : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const row = fenshen.find(f => f.id === editId);
    if (row) {
      setEditPrompt(String((row as any).prompt_md ?? ''));
      setEditTools(Array.isArray((row as any).tools_whitelist) ? (row as any).tools_whitelist : []);
      setEditEnabled((row as any).enabled !== false);
      setEditAllTools((row as any).has_all_tools !== false);
    }
  }, [editId, fenshen]);

  const q = search.trim().toLowerCase();
  const filteredProjects = (hub?.projects ?? []).filter(p => !q || p.name.toLowerCase().includes(q));
  const filteredFenshen = fenshen.filter(f => !q || f.display_name.toLowerCase().includes(q));
  const filteredDocs = (hub?.docs ?? []).filter(d => !q || d.name.toLowerCase().includes(q));
  const filteredWiki = (hub?.wiki ?? []).filter(w => !q || w.name.toLowerCase().includes(q));

  async function saveFenshen() {
    setSaveMsg(null);
    const r = await fetch('/api/fenshen/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editId,
        prompt_md: editPrompt,
        tools_whitelist: editTools,
        enabled: editEnabled,
        has_all_tools: editAllTools,
      }),
    });
    const d = await r.json().catch(() => ({}));
    setSaveMsg(r.ok ? '已保存' : `保存失败：${d.error ?? r.status}`);
    if (r.ok) void load();
  }

  return (
    <div className="min-h-[100dvh] bg-[#f7f4ee] text-stone-800">
      <header className="flex items-center gap-4 border-b border-stone-200 bg-white/80 px-6 py-3 backdrop-blur">
        <Link href="/desktop" className="flex items-center gap-2 font-semibold tracking-wide">
          <span className="text-lg">🌱</span> 元婴 · Xiaowu Hub
        </Link>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索项目、分身、文档…"
          className="mx-auto w-full max-w-xl rounded-full border border-stone-200 bg-stone-50 px-4 py-1.5 text-sm outline-none focus:border-stone-400"
        />
        <nav className="flex items-center gap-1 text-sm">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1.5 ${
                tab === t.id ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="h-9 w-9 rounded-full bg-stone-300" />
      </header>

      <div className="flex">
        <aside className="w-60 shrink-0 border-r border-stone-200 bg-[#fbf9f4] px-3 py-4">
          <h3 className="mb-2 px-2 text-[11px] uppercase tracking-widest text-stone-400">Workpads</h3>
          {filteredProjects.map(p => (
            <Link
              key={p.id}
              href={`/desktop/workpad/${p.id}`}
              className="mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-100"
            >
              <span>{p.name}</span>
              <span className="text-[11px] text-stone-400">{p.open_goals}</span>
            </Link>
          ))}
          <h3 className="mb-2 mt-5 px-2 text-[11px] uppercase tracking-widest text-stone-400">分身</h3>
          {filteredFenshen.map(f => (
            <div key={f.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {f.display_name}
            </div>
          ))}
          <h3 className="mb-2 mt-5 px-2 text-[11px] uppercase tracking-widest text-stone-400">Library · Obsidian</h3>
          {filteredWiki.slice(0, 8).map(w => (
            <div key={w.name} className="truncate px-2 py-1 text-[12px] text-stone-500">
              📄 {w.name}
            </div>
          ))}
          {filteredWiki.length === 0 && (
            <div className="px-2 text-[11px] text-stone-400">wiki/ 为空（{hub?.wiki_dir}）</div>
          )}
        </aside>

        <main className="min-w-0 flex-1 px-8 py-6">
          {error && <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}

          {tab === 'home' && (
            <>
              <section className="mb-6 rounded-2xl border border-stone-200 bg-gradient-to-br from-amber-50 to-stone-50 p-6">
                <h1 className="text-3xl font-semibold tracking-wide">早上好</h1>
                <p className="mt-2 text-sm text-stone-500">今天 {hub?.date ?? ''} · 选择一个 Workpad 进入协作</p>
              </section>

              <section className="mb-6 grid grid-cols-3 gap-4">
                <Metric label="步数" value={hub?.steps?.value ?? '—'} sub="今日" />
                <Metric label="喝水" value={`${hub?.water ?? 0}/${hub?.water_goal ?? 6}`} sub="杯" />
                <Metric label="睡眠" value={hub?.sleep?.value ?? '—'} sub="最近" />
              </section>

              <section className="mb-6">
                <h2 className="mb-2 text-sm font-semibold text-stone-600">Workpads</h2>
                <div className="grid grid-cols-2 gap-4">
                  {(hub?.projects ?? []).map(p => (
                    <Link
                      key={p.id}
                      href={`/desktop/workpad/${p.id}`}
                      className="rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-stone-300"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">🌿 {p.name}</span>
                        <span className="text-[11px] text-stone-400">{p.open_goals} goals</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[12px] text-stone-500">
                        {p.last_message ?? p.description ?? '还没有对话'}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-stone-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold text-stone-600">最近动态</h2>
                {(hub?.activity ?? []).slice(-8).map(a => (
                  <div key={a.id} className="border-b border-stone-100 py-1.5 text-[13px] text-stone-600">
                    <span className="mr-2 text-stone-400">{fmt(a.at)}</span>
                    {a.snippet}
                  </div>
                ))}
                {(hub?.activity ?? []).length === 0 && (
                  <div className="text-[12px] text-stone-400">暂无动态</div>
                )}
              </section>
            </>
          )}

          {tab === 'sandbox' && (
            <div className="mx-auto max-w-4xl space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">v0.02 沙箱安全设计</h1>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] text-amber-800">
                  v0.02a · 只读日志已接入
                </span>
              </div>
              <p className="text-[12px] text-stone-500">
                8 个高危工具的权限边界。v0.02a 已接入只读日志；其余需分阶段批准。
                审批 <b>#9</b> 在 Workpad → 审批 tab；批准前不新增任何高危工具。
              </p>
              <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white p-4">
                <table className="w-full text-left text-[12px]">
                  <thead className="text-stone-400">
                    <tr><th className="py-1 pr-3">工具</th><th className="py-1 pr-3">允许</th><th className="py-1">确认</th></tr>
                  </thead>
                  <tbody>
                    {[
                      ['git_commit', 'GitHub Contents API 建 branch/commit；不碰本地 .git', 'approval_id + issue'],
                      ['submit_pr', 'GitHub REST 建 PR；禁止 merge/force', 'approval_id + CI'],
                      ['run_terminal_command', 'workspace 内 argv 白名单；无 shell/rm/sudo', '每次审批'],
                      ['run_test_suite', '只允许 npm test / test:e2e 包装', 'approval_id'],
                      ['write_code_file', 'workspace 内代码 + diff', 'diff 预览'],
                      ['deploy_to_coolify', 'Coolify webhook；只在 UI 触发', 'Owner 红色弹窗'],
                      ['update_env_vars', '加密 + diff；日志脱敏', 'Owner 弹窗'],
                      ['read_server_logs', '只读 tail + 脱敏', '已接入（只读）'],
                    ].map(([n, a, c]) => (
                      <tr key={n} className="border-t border-stone-100">
                        <td className="py-2 pr-3 font-mono text-[11px]">{n}</td>
                        <td className="py-2 pr-3">{a}</td>
                        <td className="py-2 text-stone-500">{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-white p-4 text-[12px] text-stone-600">
                  <b>Git 写操作</b>：只走 GitHub REST，不读写本地 .git；禁止 .env/secret/node_modules 路径。
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 text-[12px] text-stone-600">
                  <b>代码执行</b>：固定 <code>~/yuanying/workspace/&lt;project&gt;</code>；argv 白名单、120s、200KB、独立 runner。
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-800">
                  <b>生产发布</b>：模型不能直接 deploy；全屏红色确认弹窗 + 确认短语 + 一次性 webhook token。
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 text-[12px] text-stone-600">
                  <b>审计</b>：approval_id、参数摘要、结果、拒绝原因；密钥不落日志。
                </div>
              </div>
              <p className="text-[11px] text-stone-400">
                完整文档：docs/specs/SANDBOX-SECURITY-v0.02.md
              </p>
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold">分身与工具白名单</h1>
              <p className="text-[12px] text-stone-500">
                只改 prompt 与工具边界；模型仍走全局路由。当前核心团队按角色启用白名单（has_all_tools=false）；只有显式开启“全部工具”才放开。
              </p>
              <div className="rounded-xl border border-stone-200 bg-white p-4">
                <select
                  value={editId}
                  onChange={e => setEditId(e.target.value)}
                  className="mb-3 rounded-lg border border-stone-200 px-3 py-1.5 text-sm"
                >
                  {fenshen.map(f => (
                    <option key={f.id} value={f.id}>{f.display_name}</option>
                  ))}
                </select>
                <div className="mb-3 flex flex-wrap gap-4 text-[12px] text-stone-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editEnabled}
                      onChange={e => setEditEnabled(e.target.checked)}
                    />
                    启用该分身
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editAllTools}
                      onChange={e => setEditAllTools(e.target.checked)}
                    />
                    全部工具（关闭后按白名单）
                  </label>
                </div>
                <textarea
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-[12px] outline-none focus:border-stone-400"
                />
                <div className="mt-3 grid max-h-64 grid-cols-2 gap-1 overflow-y-auto">
                  {tools.map(t => (
                    <label key={t} className="flex items-center gap-2 text-[12px] text-stone-600">
                      <input
                        type="checkbox"
                        checked={editTools.includes(t)}
                        onChange={e =>
                          setEditTools(prev => (e.target.checked ? [...prev, t] : prev.filter(x => x !== t)))
                        }
                      />
                      {t}
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={saveFenshen} className="rounded-lg bg-stone-800 px-4 py-1.5 text-sm text-white">
                    保存
                  </button>
                  {saveMsg && <span className="text-[12px] text-stone-500">{saveMsg}</span>}
                </div>
              </div>
            </div>
          )}
        </main>

        <aside className="w-72 shrink-0 border-l border-stone-200 bg-[#fbf9f4] px-4 py-4">
          <h3 className="mb-2 text-[11px] uppercase tracking-widest text-stone-400">健康指标</h3>
          <div className="space-y-2 text-sm">
            <Row label="步数" value={`${hub?.steps?.value ?? '—'}`} />
            <Row label="喝水" value={`${hub?.water ?? 0}/${hub?.water_goal ?? 6}`} />
            <Row label="睡眠" value={`${hub?.sleep?.value ?? '—'}`} />
          </div>
          <h3 className="mb-2 mt-5 text-[11px] uppercase tracking-widest text-stone-400">Artifacts</h3>
          <div className="space-y-1 text-[12px]">
            {filteredDocs.map(d => (
              <div key={`${d.project_id}-${d.name}`} className="flex justify-between text-stone-500">
                <span className="truncate">📄 {d.name}</span>
                <span className="text-stone-400">{fmt(d.updated_at)}</span>
              </div>
            ))}
            {filteredWiki.map(w => (
              <div key={w.name} className="flex justify-between text-stone-500">
                <span className="truncate">📝 {w.name}</span>
                <span className="text-stone-400">{fmt(w.updated_at)}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-[11px] uppercase tracking-widest text-stone-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-[11px] text-stone-400">{sub}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-stone-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

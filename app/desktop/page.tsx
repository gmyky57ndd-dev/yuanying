'use client';
import { useCallback, useEffect, useState } from 'react';
import { postChat } from '@/lib/api';

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  last_message: string | null;
  last_at: string | null;
  open_goals: number;
};
type Fenshen = { id: string; display_name: string; tools_whitelist: string[] | null; prompt_md?: string; kind?: string };
type Goal = { id: number; project_id: string | null; title: string; status: string; due_date: string | null };
type Activity = { id: number; role: string; project_id: string | null; snippet: string; at: string };
type Doc = { project_id: string; name: string; chars: number; updated_at: string };
type Wiki = { name: string; size: number; updated_at: string };
type Hub = {
  date: string;
  steps: { value: number; context: any; at: string } | null;
  water: number;
  water_goal: number;
  sleep: { value: any; at: string } | null;
  projects: Project[];
  goals: Goal[];
  activity: Activity[];
  docs: Doc[];
  wiki: Wiki[];
  wiki_dir: string;
};

const tabs = [
  { id: 'home', label: '首页' },
  { id: 'workpad', label: 'Workpad' },
  { id: 'settings', label: '设置' },
] as const;
type Tab = (typeof tabs)[number]['id'];

function fmt(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

export default function DesktopPage() {
  const [tab, setTab] = useState<Tab>('home');
  const [projectId, setProjectId] = useState('yuanying');
  const [hub, setHub] = useState<Hub | null>(null);
  const [fenshen, setFenshen] = useState<Fenshen[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [chat, setChat] = useState<Array<{ role: string; text: string }>>([]);
  const [sending, setSending] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [editId, setEditId] = useState<string>('ai_pm');
  const [editPrompt, setEditPrompt] = useState('');
  const [editTools, setEditTools] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, f] = await Promise.all([
        fetch(`/api/hub?project_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/fenshen/config', { cache: 'no-store' }).then(r => r.json()),
      ]);
      setHub(h);
      setFenshen(Array.isArray(f?.fenshen) ? f.fenshen : []);
      setTools(Array.isArray(f?.tools) ? f.tools : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const row = fenshen.find(f => f.id === editId);
    if (row) {
      setEditPrompt(String(row.prompt_md ?? ''));
      setEditTools(Array.isArray(row.tools_whitelist) ? row.tools_whitelist : []);
    }
  }, [editId, fenshen]);

  const project = hub?.projects.find(p => p.id === projectId) ?? null;
  const q = search.trim().toLowerCase();
  const filteredProjects = (hub?.projects ?? []).filter(p => !q || p.name.toLowerCase().includes(q));
  const filteredFenshen = fenshen.filter(f => !q || f.display_name.toLowerCase().includes(q));
  const filteredDocs = (hub?.docs ?? []).filter(d => !q || d.name.toLowerCase().includes(q));
  const filteredWiki = (hub?.wiki ?? []).filter(w => !q || w.name.toLowerCase().includes(q));

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    setChat(c => [...c, { role: 'user', text }]);
    try {
      const sid =
        (typeof window !== 'undefined' && window.localStorage.getItem('yy_session_id')) ||
        (crypto.randomUUID?.() ?? `s-${Date.now()}`);
      if (typeof window !== 'undefined') window.localStorage.setItem('yy_session_id', sid);
      const d = await postChat(text, sid, undefined, undefined, 'ai_pm', projectId);
      setChat(c => [...c, { role: 'assistant', text: d.reply || '（空回复）' }]);
      void load();
    } catch (e) {
      setChat(c => [...c, { role: 'assistant', text: `失败：${e instanceof Error ? e.message : 'unknown'}` }]);
    } finally {
      setSending(false);
    }
  }

  async function toggleGoal(g: Goal) {
    await fetch('/api/goals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g.id, status: g.status === 'done' ? 'open' : 'done' }),
    });
    void load();
  }

  async function addGoal() {
    const title = goalTitle.trim();
    if (!title) return;
    setGoalTitle('');
    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, project_id: projectId }),
    });
    void load();
  }

  async function saveFenshen() {
    setSaveMsg(null);
    const r = await fetch('/api/fenshen/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, prompt_md: editPrompt, tools_whitelist: editTools }),
    });
    const d = await r.json().catch(() => ({}));
    setSaveMsg(r.ok ? '已保存' : `保存失败：${d.error ?? r.status}`);
    if (r.ok) void load();
  }

  return (
    <div className="min-h-[100dvh] bg-[#f7f4ee] text-stone-800">
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-stone-200 bg-white/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2 font-semibold tracking-wide">
          <span className="text-lg">🌱</span> 元婴 · Xiaowu Hub
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="全局搜索（项目、分身、文档…）"
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
        {/* Sidebar */}
        <aside className="w-60 shrink-0 border-r border-stone-200 bg-[#fbf9f4] px-3 py-4">
          <h3 className="mb-2 px-2 text-[11px] uppercase tracking-widest text-stone-400">工作区</h3>
          {filteredProjects.map(p => (
            <button
              key={p.id}
              onClick={() => setProjectId(p.id)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
                p.id === projectId ? 'bg-stone-200/70 font-medium' : 'hover:bg-stone-100'
              }`}
            >
              <span>{p.name}</span>
              <span className="text-[11px] text-stone-400">{p.open_goals}</span>
            </button>
          ))}

          <h3 className="mb-2 mt-5 px-2 text-[11px] uppercase tracking-widest text-stone-400">分身</h3>
          {filteredFenshen.map(f => (
            <div key={f.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {f.display_name}
            </div>
          ))}

          <h3 className="mb-2 mt-5 px-2 text-[11px] uppercase tracking-widest text-stone-400">
            Library · Obsidian
          </h3>
          {filteredWiki.slice(0, 8).map(w => (
            <div key={w.name} className="truncate px-2 py-1 text-[12px] text-stone-500">
              📄 {w.name}
            </div>
          ))}
          {filteredWiki.length === 0 && (
            <div className="px-2 text-[11px] text-stone-400">
              wiki/ 为空（{hub?.wiki_dir}）
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 px-8 py-6">
          {error && <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}

          {tab === 'home' && (
            <>
              <section className="mb-6 rounded-2xl border border-stone-200 bg-gradient-to-br from-amber-50 to-stone-50 p-6">
                <h1 className="text-3xl font-semibold tracking-wide">早上好</h1>
                <p className="mt-2 text-sm text-stone-500">
                  今天 {hub?.date ?? ''} · 项目「{project?.name ?? '—'}」有 {hub?.goals.length ?? 0} 个未完成目标
                </p>
              </section>

              <section className="mb-6 grid grid-cols-3 gap-4">
                <Metric label="步数" value={hub?.steps?.value ?? '—'} sub="今日" />
                <Metric label="喝水" value={`${hub?.water ?? 0}/${hub?.water_goal ?? 6}`} sub="杯" />
                <Metric label="睡眠" value={hub?.sleep?.value ?? '—'} sub="最近" />
              </section>

              <section className="mb-6">
                <h2 className="mb-2 text-sm font-semibold text-stone-600">活跃 Workpads</h2>
                <div className="grid grid-cols-2 gap-4">
                  {(hub?.projects ?? []).map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setProjectId(p.id);
                        setTab('workpad');
                      }}
                      className="rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-stone-300"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">🌿 {p.name}</span>
                        <span className="text-[11px] text-stone-400">{p.open_goals} goals</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[12px] text-stone-500">
                        {p.last_message ?? p.description ?? '还没有对话'}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold text-stone-600">今日目标</h2>
                <div className="space-y-1">
                  {(hub?.goals ?? []).map(g => (
                    <label key={g.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={g.status === 'done'} onChange={() => toggleGoal(g)} />
                      <span className={g.status === 'done' ? 'text-stone-400 line-through' : ''}>{g.title}</span>
                      {g.due_date && <span className="text-[11px] text-stone-400">{g.due_date}</span>}
                    </label>
                  ))}
                  {(hub?.goals ?? []).length === 0 && (
                    <div className="text-[12px] text-stone-400">还没有目标，添加一个。</div>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={goalTitle}
                    onChange={e => setGoalTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addGoal()}
                    placeholder="添加目标…"
                    className="flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-stone-400"
                  />
                  <button onClick={addGoal} className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm text-white">
                    添加
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-stone-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold text-stone-600">和拓维聊这个项目</h2>
                <div className="mb-2 max-h-56 space-y-2 overflow-y-auto">
                  {chat.map((m, i) => (
                    <div
                      key={i}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        m.role === 'user' ? 'ml-auto bg-stone-100' : 'bg-amber-50'
                      } max-w-[80%] whitespace-pre-wrap`}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    rows={2}
                    placeholder="记录想法、规划、提问…"
                    className="flex-1 resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-400"
                  />
                  <button
                    onClick={send}
                    disabled={sending || !draft.trim()}
                    className="rounded-lg bg-stone-800 px-4 text-sm text-white disabled:opacity-40"
                  >
                    {sending ? '…' : '发送'}
                  </button>
                </div>
              </section>
            </>
          )}

          {tab === 'workpad' && (
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold">{project?.name}</h1>
              <p className="text-sm text-stone-500">{project?.description}</p>
              <div className="rounded-xl border border-stone-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold text-stone-600">项目文档</h2>
                {filteredDocs.length === 0 && <div className="text-[12px] text-stone-400">暂无</div>}
                {filteredDocs.map(d => (
                  <div key={`${d.project_id}-${d.name}`} className="flex justify-between py-1 text-sm">
                    <span>📄 {d.name}</span>
                    <span className="text-[11px] text-stone-400">{d.chars} 字</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-stone-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold text-stone-600">最近对话</h2>
                {(hub?.activity ?? []).slice(-5).map(a => (
                  <div key={a.id} className="border-b border-stone-100 py-1 text-[12px] text-stone-500">
                    <span className="text-stone-400">{fmt(a.at)}</span> {a.snippet}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold">分身与工具白名单</h1>
              <p className="text-[12px] text-stone-500">
                只改 prompt 与工具边界；模型仍走全局路由（owner 决定）。
              </p>
              <div className="rounded-xl border border-stone-200 bg-white p-4">
                <select
                  value={editId}
                  onChange={e => setEditId(e.target.value)}
                  className="mb-3 rounded-lg border border-stone-200 px-3 py-1.5 text-sm"
                >
                  {fenshen.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.display_name}
                    </option>
                  ))}
                </select>
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
                          setEditTools(prev =>
                            e.target.checked ? [...prev, t] : prev.filter(x => x !== t)
                          )
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

        {/* Inspector */}
        <aside className="w-72 shrink-0 border-l border-stone-200 bg-[#fbf9f4] px-4 py-4">
          <h3 className="mb-2 text-[11px] uppercase tracking-widest text-stone-400">健康指标</h3>
          <div className="space-y-2 text-sm">
            <Row label="步数" value={`${hub?.steps?.value ?? '—'}`} />
            <Row label="喝水" value={`${hub?.water ?? 0}/${hub?.water_goal ?? 6}`} />
            <Row label="睡眠" value={`${hub?.sleep?.value ?? '—'}`} />
          </div>

          <h3 className="mb-2 mt-5 text-[11px] uppercase tracking-widest text-stone-400">最近动态</h3>
          <div className="space-y-1 text-[12px] text-stone-500">
            {(hub?.activity ?? []).slice(-6).map(a => (
              <div key={a.id} className="truncate">
                <span className="text-stone-400">{fmt(a.at)}</span> {a.snippet}
              </div>
            ))}
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

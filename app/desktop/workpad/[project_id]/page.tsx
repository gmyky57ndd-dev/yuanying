'use client';
import Link from 'next/link';
import { postChat } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';

type Artifact = { name: string; source: string; chars: number; updated_at: string };
type Issue = { number: number; title: string; state: string; url: string; updated_at: string; labels: string[] };
type Message = { id: number; role: string; content: string; created_at: string; responder_fenshen_id?: string | null };
type FenshenRow = { id: string; display_name: string; model_name: string | null; tools_whitelist: string[] | null };
type ModelRow = { id: string; provider: string; model_name: string };

const tabs = [
  { id: 'chat', label: '群聊' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'issues', label: 'Issues' },
] as const;
type Tab = (typeof tabs)[number]['id'];

function fmt(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function WorkpadPage({ params }: { params: { project_id: string } }) {
  const projectId = params.project_id;
  const [tab, setTab] = useState<Tab>('chat');
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [projectName, setProjectName] = useState(projectId);
  const [allFenshen, setAllFenshen] = useState<FenshenRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [lead, setLead] = useState<string>('');
  const [savingMembers, setSavingMembers] = useState(false);
  const [memberMsg, setMemberMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const [h, m, a, i, cfg, mods] = await Promise.all([
      fetch('/api/hub', { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/projects/${projectId}/fenshen`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/projects/${projectId}/artifacts`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/projects/${projectId}/issues`, { cache: 'no-store' }).then(async r => ({ ok: r.ok, data: await r.json() })),
      fetch('/api/fenshen/config', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/models', { cache: 'no-store' }).then(r => r.json()),
    ]);
    const p = (h?.projects ?? []).find((x: any) => x.id === projectId);
    if (p) setProjectName(p.name);
    const memberRows = Array.isArray(m?.members) ? m.members : [];
    setMemberIds(memberRows.map((x: any) => x.fenshen_id));
    setLead(memberRows.find((x: any) => x.is_lead)?.fenshen_id ?? memberRows[0]?.fenshen_id ?? '');
    setAllFenshen(Array.isArray(cfg?.fenshen) ? cfg.fenshen : []);
    setModels(Array.isArray(mods?.models) ? mods.models : []);
    setArtifacts(Array.isArray(a?.artifacts) ? a.artifacts : []);
    setIssues(i.ok ? i.data?.issues ?? [] : []);
    setIssueError(i.ok ? null : i.data?.error ?? 'GitHub unavailable');
    const hist = await fetch(`/api/history?project_id=${encodeURIComponent(projectId)}&limit=30`, {
      cache: 'no-store',
    }).then(r => r.json());
    setMessages(Array.isArray(hist?.messages) ? hist.messages : []);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendRoom() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      const sid =
        (typeof window !== 'undefined' && window.localStorage.getItem('yy_session_id')) ||
        (crypto.randomUUID?.() ?? `s-${Date.now()}`);
      if (typeof window !== 'undefined') window.localStorage.setItem('yy_session_id', sid);
      await postChat(text, sid, undefined, undefined, undefined, projectId, memberIds);
      await load();
    } catch (e) {
      setMemberMsg(`发送失败：${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSending(false);
    }
  }

  async function saveMembers() {
    if (!memberIds.length) {
      setMemberMsg('至少选一个分身');
      return;
    }
    setSavingMembers(true);
    setMemberMsg(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/fenshen`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fenshen_ids: memberIds, lead: lead || memberIds[0] }),
      });
      const d = await r.json().catch(() => ({}));
      setMemberMsg(r.ok ? '已保存' : `保存失败：${d.error ?? r.status}`);
      if (r.ok) await load();
    } finally {
      setSavingMembers(false);
    }
  }

  async function setModel(fenshenId: string, modelName: string) {
    const r = await fetch('/api/fenshen/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fenshenId, model_name: modelName || null }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMemberMsg(`模型保存失败：${d.error ?? r.status}`);
      return;
    }
    setAllFenshen(prev =>
      prev.map(f => (f.id === fenshenId ? { ...f, model_name: modelName || null } : f))
    );
    setMemberMsg('模型已更新');
  }

  return (
    <div className="min-h-[100dvh] bg-[#f7f4ee] text-stone-800">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white/80 px-6 py-3 backdrop-blur">
        <Link href="/desktop" className="text-sm text-stone-500 hover:text-stone-800">
          ← Hub
        </Link>
        <span className="text-sm text-stone-300">/</span>
        <span className="font-medium">🌿 {projectName}</span>
        <nav className="ml-6 flex items-center gap-1 text-sm">
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
      </header>

      <div className="flex">
        <main className="min-w-0 flex-1 px-8 py-6">
          {tab === 'chat' && (
            <div className="rounded-xl border border-stone-200 bg-white">
              <div className="border-b border-stone-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-stone-600">群聊 · {projectId}</h2>
                <p className="mt-1 text-[12px] text-stone-400">
                  服务端按 @分身 → lead → 第一个成员选择回复者；模型取该分身的配置。
                </p>
              </div>
              <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4">
                {messages.length === 0 && (
                  <div className="text-[12px] text-stone-400">这个 Workpad 还没有对话。</div>
                )}
                {messages.map(m => (
                  <div key={m.id} className={m.role === 'user' ? 'ml-auto max-w-[75%]' : 'max-w-[75%]'}>
                    <div className="mb-0.5 text-[10px] text-stone-400">
                      {m.role === 'user'
                        ? '我'
                        : allFenshen.find(f => f.id === m.responder_fenshen_id)?.display_name ??
                          m.responder_fenshen_id ??
                          '元婴'}{' '}
                      · {fmt(m.created_at)}
                    </div>
                    <div
                      className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                        m.role === 'user' ? 'bg-stone-100' : 'bg-amber-50'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-stone-100 p-3">
                <div className="mb-2 flex flex-wrap gap-1">
                  {memberIds.map(id => {
                    const f = allFenshen.find(x => x.id === id);
                    return (
                      <button
                        key={id}
                        onClick={() => setDraft(d => `${d}@${f?.display_name ?? id} `)}
                        className="rounded-full border border-stone-200 px-2 py-0.5 text-[10px] text-stone-500 hover:bg-stone-50"
                      >
                        @{f?.display_name ?? id}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendRoom();
                      }
                    }}
                    rows={2}
                    placeholder="在房间里说点什么；@分身 指定回复者，默认 lead 回复…"
                    className="flex-1 resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-400"
                  />
                  <button
                    onClick={sendRoom}
                    disabled={sending || !draft.trim()}
                    className="rounded-lg bg-stone-800 px-4 text-sm text-white disabled:opacity-40"
                  >
                    {sending ? '…' : '发送'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'artifacts' && (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-stone-600">项目文件</h2>
              {artifacts.length === 0 && <div className="text-[12px] text-stone-400">还没有产物。</div>}
              {artifacts.map(a => (
                <div key={`${a.source}-${a.name}`} className="flex justify-between border-b border-stone-100 py-1.5 text-sm">
                  <span>
                    {a.source === 'wiki' ? '📝' : '📄'} {a.name}
                    <span className="ml-2 text-[10px] text-stone-400">{a.source}</span>
                  </span>
                  <span className="text-[11px] text-stone-400">{a.chars} 字 · {fmt(a.updated_at)}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'issues' && (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-stone-600">GitHub Issues · label project:{projectId}</h2>
              {issueError && <div className="mb-2 text-[12px] text-amber-700">{issueError}</div>}
              {issues.length === 0 && !issueError && <div className="text-[12px] text-stone-400">没有关联的 Issue。</div>}
              {issues.map(i => (
                <a
                  key={i.number}
                  href={i.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between border-b border-stone-100 py-1.5 text-sm hover:bg-stone-50"
                >
                  <span>#{i.number} {i.title}</span>
                  <span className={`text-[11px] ${i.state === 'open' ? 'text-emerald-600' : 'text-stone-400'}`}>
                    {i.state} · {fmt(i.updated_at)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </main>

        <aside className="w-72 shrink-0 border-l border-stone-200 bg-[#fbf9f4] px-4 py-4">
          <h3 className="mb-2 text-[11px] uppercase tracking-widest text-stone-400">参战分身</h3>
          <div className="space-y-2">
            {allFenshen.map(f => {
              const checked = memberIds.includes(f.id);
              return (
                <div key={f.id} className="rounded-lg border border-stone-200 bg-white px-3 py-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        setMemberIds(prev =>
                          e.target.checked ? [...prev, f.id] : prev.filter(x => x !== f.id)
                        );
                        if (!e.target.checked && lead === f.id) setLead('');
                      }}
                    />
                    <span className="flex-1">{f.display_name}</span>
                    {checked && (
                      <input
                        type="radio"
                        name="lead"
                        checked={lead === f.id}
                        onChange={() => setLead(f.id)}
                        title="设为首选回复者（lead）"
                      />
                    )}
                  </label>
                  {checked && (
                    <select
                      value={f.model_name ?? ''}
                      onChange={e => void setModel(f.id, e.target.value)}
                      className="mt-2 w-full rounded border border-stone-200 px-2 py-1 text-[11px]"
                    >
                      <option value="">模型：全局路由</option>
                      {models.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.provider}/{m.model_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={saveMembers}
              disabled={savingMembers}
              className="rounded-lg bg-stone-800 px-3 py-1.5 text-[12px] text-white disabled:opacity-40"
            >
              {savingMembers ? '保存中…' : '保存成员'}
            </button>
            {memberMsg && <span className="text-[11px] text-stone-500">{memberMsg}</span>}
          </div>
          <p className="mt-3 text-[11px] text-stone-400">
            勾选参战分身，圆点设为首选回复者（lead）；每个分身可单独选模型，留空走全局。
          </p>
        </aside>
      </div>
    </div>
  );
}

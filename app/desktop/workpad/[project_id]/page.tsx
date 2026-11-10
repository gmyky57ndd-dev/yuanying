'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Member = {
  fenshen_id: string;
  is_lead: boolean;
  fenshen: {
    id: string;
    display_name: string;
    tools_whitelist: string[] | null;
    model_name: string | null;
  } | null;
};
type Artifact = { name: string; source: string; chars: number; updated_at: string };
type Issue = { number: number; title: string; state: string; url: string; updated_at: string; labels: string[] };
type Message = { id: number; role: string; content: string; created_at: string; responder_fenshen_id?: string | null };

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
  const [members, setMembers] = useState<Member[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [projectName, setProjectName] = useState(projectId);

  const load = useCallback(async () => {
    const [h, m, a, i] = await Promise.all([
      fetch('/api/hub', { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/projects/${projectId}/fenshen`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/projects/${projectId}/artifacts`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/projects/${projectId}/issues`, { cache: 'no-store' }).then(async r => ({ ok: r.ok, data: await r.json() })),
    ]);
    const p = (h?.projects ?? []).find((x: any) => x.id === projectId);
    if (p) setProjectName(p.name);
    setMembers(Array.isArray(m?.members) ? m.members : []);
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
                  输入框与 @分身接力在下一阶段接入（本页先只读展示历史；路由与房间已就绪）。
                </p>
              </div>
              <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4">
                {messages.length === 0 && (
                  <div className="text-[12px] text-stone-400">这个 Workpad 还没有对话。</div>
                )}
                {messages.map(m => (
                  <div key={m.id} className={m.role === 'user' ? 'ml-auto max-w-[75%]' : 'max-w-[75%]'}>
                    <div className="mb-0.5 text-[10px] text-stone-400">
                      {m.role === 'user' ? '我' : m.responder_fenshen_id ?? '元婴'} · {fmt(m.created_at)}
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
            {members.map(m => (
              <div key={m.fenshen_id} className="rounded-lg border border-stone-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    {m.is_lead ? '★ ' : ''}
                    {m.fenshen?.display_name ?? m.fenshen_id}
                  </span>
                  <span className="text-[10px] text-stone-400">{m.is_lead ? 'lead' : 'member'}</span>
                </div>
                <div className="mt-1 text-[10px] text-stone-400">
                  模型：{m.fenshen?.model_name ?? '全局路由'} · 工具：{m.fenshen?.tools_whitelist?.length ?? '全部'}
                </div>
              </div>
            ))}
            {members.length === 0 && <div className="text-[12px] text-stone-400">未配置参战分身。</div>}
          </div>
          <p className="mt-3 text-[11px] text-stone-400">
            成员编辑与「每分身模型」在下一阶段开放（需你确认路由/迁移后接入）。
          </p>
        </aside>
      </div>
    </div>
  );
}

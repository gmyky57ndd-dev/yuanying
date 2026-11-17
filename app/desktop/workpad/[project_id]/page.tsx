'use client';
import Link from 'next/link';
import { postChat, type ChatAttachment } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';

type Artifact = { name: string; source: string; chars: number; updated_at: string };
type Issue = { number: number; title: string; state: string; url: string; updated_at: string; labels: string[] };
type Message = { id: number; role: string; content: string; created_at: string; responder_fenshen_id?: string | null; truncated?: boolean };
type FenshenRow = { id: string; display_name: string; model_name: string | null; primary_model: string | null; backup_model: string | null; tools_whitelist: string[] | null };
type ModelRow = { id: string; provider: string; model_name: string };
type Approval = { id: number; title: string; description: string | null; adr: string | null; status: string; approved_by: string | null; issue_number: number | null; issue_url: string | null; updated_at: string };

const tabs = [
  { id: 'chat', label: '群聊' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'issues', label: 'Issues' },
  { id: 'approvals', label: '审批' },
  { id: 'ledger', label: '台账' },
] as const;
type Tab = (typeof tabs)[number]['id'];
type PendingAttachment = ChatAttachment & { preview?: string };

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
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [attachMsg, setAttachMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedMsgs, setExpandedMsgs] = useState<Record<string, boolean>>({});
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [cost, setCost] = useState<any>(null);
  const [budgetTokens, setBudgetTokens] = useState('');
  const [budgetCost, setBudgetCost] = useState('');
  const [budgetMsg, setBudgetMsg] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [adrDraft, setAdrDraft] = useState<Record<number, string>>({});
  const [approvalMsg, setApprovalMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, m, a, i, cfg, mods, appr, led, costRes] = await Promise.all([
      fetch('/api/hub', { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/projects/${projectId}/fenshen`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/projects/${projectId}/artifacts`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/projects/${projectId}/issues`, { cache: 'no-store' }).then(async r => ({ ok: r.ok, data: await r.json() })),
      fetch('/api/fenshen/config', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/models', { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/approvals?project_id=${encodeURIComponent(projectId)}`, {
        cache: 'no-store',
      }).then(r => r.json()),
      fetch(`/api/actions?project_id=${encodeURIComponent(projectId)}`, {
        cache: 'no-store',
      }).then(r => r.json()),
      fetch(`/api/cost?project_id=${encodeURIComponent(projectId)}`, {
        cache: 'no-store',
      }).then(r => r.json()),
    ]);
    const p = (h?.projects ?? []).find((x: any) => x.id === projectId);
    if (p) setProjectName(p.name);
    const memberRows = Array.isArray(m?.members) ? m.members : [];
    setMemberIds(memberRows.map((x: any) => x.fenshen_id));
    setLead(memberRows.find((x: any) => x.is_lead)?.fenshen_id ?? memberRows[0]?.fenshen_id ?? '');
    setAllFenshen(Array.isArray(cfg?.fenshen) ? cfg.fenshen : []);
    setModels(Array.isArray(mods?.models) ? mods.models : []);
    setApprovals(Array.isArray(appr?.approvals) ? appr.approvals : []);
    setLedger(Array.isArray(led?.actions) ? led.actions : []);
    setCost(costRes?.cost ?? null);
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

  const TEXT_EXT = /\.(md|txt|json|csv|log|ts|tsx|js|jsx|py|html|css|ya?ml|xml|toml|sh)$/i;

  async function readImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });
  }

  async function attachFiles(list: FileList | File[]) {
    const incoming = Array.from(list).slice(0, 4);
    const next: PendingAttachment[] = [];
    for (const file of incoming) {
      if (attachments.length + next.length >= 4) {
        setAttachMsg('最多附加 4 个文件');
        break;
      }
      const isImage = file.type.startsWith('image/');
      const isText = file.type.startsWith('text/') || TEXT_EXT.test(file.name);
      if (!isImage && !isText) {
        setAttachMsg(`不支持的文件类型：${file.name}`);
        continue;
      }
      if (isImage && file.size > 8 * 1024 * 1024) {
        setAttachMsg(`图片过大（上限 8MB）：${file.name}`);
        continue;
      }
      if (!isImage && file.size > 2 * 1024 * 1024) {
        setAttachMsg(`文本文件过大（上限 2MB）：${file.name}`);
        continue;
      }
      try {
        if (isImage) {
          const data = await readImage(file);
          next.push({
            name: file.name,
            kind: 'image',
            mime_type: file.type || 'image/*',
            data,
            size: file.size,
            preview: data,
          });
        } else {
          const text = await file.text();
          next.push({
            name: file.name,
            kind: 'text',
            mime_type: file.type || 'text/plain',
            data: text.slice(0, 60_000),
            size: file.size,
          });
        }
      } catch {
        setAttachMsg(`读取失败：${file.name}`);
      }
    }
    if (next.length) {
      setAttachments(prev => [...prev, ...next].slice(0, 4));
      setAttachMsg(`已附加 ${next.length} 个文件`);
    }
  }

  async function sendRoom() {
    const text = draft.trim();
    if ((!text && attachments.length === 0) || sending) return;
    setSending(true);
    const payload = attachments.map(a => ({
      name: a.name,
      kind: a.kind,
      mime_type: a.mime_type,
      data: a.data,
      size: a.size,
    }));
    setDraft('');
    setAttachments([]);
    setAttachMsg(null);
    try {
      const sid =
        (typeof window !== 'undefined' && window.localStorage.getItem('yy_session_id')) ||
        (crypto.randomUUID?.() ?? `s-${Date.now()}`);
      if (typeof window !== 'undefined') window.localStorage.setItem('yy_session_id', sid);
      await postChat(
        text || '请查看附件图片。',
        sid,
        undefined,
        undefined,
        undefined,
        projectId,
        memberIds,
        payload
      );
      await load();
    } catch (e) {
      setMemberMsg(`发送失败：${e instanceof Error ? e.message : 'unknown'}`);
      setAttachMsg(`发送失败：${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSending(false);
    }
  }

  async function sendContinue() {
    if (sending) return;
    setSending(true);
    try {
      const sid =
        (typeof window !== 'undefined' && window.localStorage.getItem('yy_session_id')) ||
        (crypto.randomUUID?.() ?? `s-${Date.now()}`);
      if (typeof window !== 'undefined') window.localStorage.setItem('yy_session_id', sid);
      await postChat('[continue]', sid, undefined, undefined, undefined, projectId, memberIds);
      await load();
    } catch (e) {
      setMemberMsg(`续写失败：${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSending(false);
    }
  }

  async function createApproval() {
    const title = newTitle.trim();
    if (!title) return;
    setApprovalMsg(null);
    const r = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, title, description: newDesc }),
    });
    const d = await r.json().catch(() => ({}));
    setApprovalMsg(r.ok ? '已提交，等待 ADR/批准' : `失败：${d.error ?? r.status}`);
    if (r.ok) {
      setNewTitle('');
      setNewDesc('');
      await load();
    }
  }

  async function actApproval(id: number, action: string, extra?: Record<string, unknown>) {
    setApprovalMsg(null);
    const r = await fetch('/api/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, ...extra }),
    });
    const d = await r.json().catch(() => ({}));
    setApprovalMsg(r.ok ? '已更新' : `失败：${d.error ?? r.status}`);
    if (r.ok) await load();
  }

  useEffect(() => {
    if (cost) {
      setBudgetTokens(String(cost.token_budget ?? 0));
      setBudgetCost(String(cost.cost_budget ?? 0));
    }
  }, [cost]);

  async function saveBudget() {
    setBudgetMsg(null);
    const r = await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        token_budget: Number(budgetTokens) || 0,
        cost_budget: Number(budgetCost) || 0,
      }),
    });
    const d = await r.json().catch(() => ({}));
    setBudgetMsg(r.ok ? '预算已保存' : `失败：${d.error ?? r.status}`);
    if (r.ok) {
      const c = await fetch(`/api/cost?project_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' }).then(x => x.json()).catch(() => null);
      setCost(c?.cost ?? null);
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

  async function setModel(
    fenshenId: string,
    field: 'primary_model' | 'backup_model',
    modelName: string
  ) {
    const r = await fetch('/api/fenshen/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fenshenId, [field]: modelName || null }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMemberMsg(`模型保存失败：${d.error ?? r.status}`);
      return;
    }
    setAllFenshen(prev =>
      prev.map(f => (f.id === fenshenId ? { ...f, [field]: modelName || null } : f))
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
            <div
              className="relative rounded-xl border border-stone-200 bg-white"
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={e => {
                if (e.currentTarget === e.target) setDragging(false);
              }}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files?.length) void attachFiles(e.dataTransfer.files);
              }}
            >
              {dragging && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-stone-900/70 text-sm text-white">
                  松开以附加文本或图片文件
                </div>
              )}
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
                {messages.map(m => {
                  const key = String(m.id);
                  const isLong = m.role === 'assistant' && m.content.length > 600;
                  const open = !!expandedMsgs[key];
                  const body =
                    isLong && !open ? `${m.content.slice(0, 600).trimEnd()}…` : m.content;
                  return (
                    <div
                      key={m.id}
                      className={m.role === 'user' ? 'ml-auto max-w-[75%]' : 'max-w-[75%]'}
                    >
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
                        {body}
                      </div>
                      {isLong && (
                        <button
                          onClick={() =>
                            setExpandedMsgs(prev => ({ ...prev, [key]: !prev[key] }))
                          }
                          className="mt-1 text-[10px] text-stone-400 underline"
                        >
                          {open ? '收起' : '展开全文'}
                        </button>
                      )}
                      {m.truncated && (
                        <button
                          onClick={sendContinue}
                          className="ml-2 mt-1 text-[10px] text-amber-600 underline"
                        >
                          一键续写
                        </button>
                      )}
                    </div>
                  );
                })}
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
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((a, i) => (
                      <div
                        key={`${a.name}-${i}`}
                        className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] text-stone-600"
                      >
                        {a.kind === 'image' && a.preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.preview} alt={a.name} className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <span>📄</span>
                        )}
                        <span className="max-w-[140px] truncate">{a.name}</span>
                        <span className="text-stone-400">{Math.ceil(a.size / 1024)}KB</span>
                        <button
                          onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                          className="text-stone-400 hover:text-stone-700"
                          aria-label={`移除 ${a.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {attachMsg && <p className="mb-2 text-[11px] text-stone-500">{attachMsg}</p>}
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".md,.txt,.json,.csv,.log,.ts,.tsx,.js,.jsx,.py,.html,.css,.yaml,.yml,.xml,.toml,.sh,image/*"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files?.length) void attachFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-stone-200 px-3 text-sm text-stone-500 hover:bg-stone-50"
                    title="附加文本或图片"
                    aria-label="附加文件"
                  >
                    ＋
                  </button>
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
                    disabled={sending || (!draft.trim() && attachments.length === 0)}
                    className="rounded-lg bg-stone-800 px-4 text-sm text-white disabled:opacity-40"
                  >
                    {sending ? '…' : '发送'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'approvals' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-stone-200 bg-white p-4">
                <h2 className="mb-1 text-sm font-semibold text-stone-600">审批流</h2>
                <p className="mb-3 text-[11px] text-stone-400">
                  proposed → ADR → approved → implementing → done；未批准的 id 不能用于 push_to_dev。
                </p>
                <p className="mb-3 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                  全局门禁：push_to_dev 只接受已批准的 approval_id，未批准不会建 Issue。
                </p>
                <div className="flex flex-col gap-2">
                  <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="工作项标题"
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm"
                  />
                  <textarea
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="要做什么、为什么"
                    rows={2}
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm"
                  />
                  <button
                    onClick={createApproval}
                    disabled={!newTitle.trim()}
                    className="self-start rounded-lg bg-stone-800 px-4 py-1.5 text-sm text-white disabled:opacity-40"
                  >
                    提交提议
                  </button>
                  {approvalMsg && <span className="text-[11px] text-stone-500">{approvalMsg}</span>}
                </div>
              </div>
              {approvals.length === 0 && (
                <div className="text-[12px] text-stone-400">还没有审批项。</div>
              )}
              {approvals.map(a => (
                <div key={a.id} className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">#{a.id} {a.title}</div>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600">
                      {a.status}
                    </span>
                  </div>
                  {a.description && <p className="mt-1 text-[12px] text-stone-500">{a.description}</p>}
                  {a.issue_number && (
                    <a
                      href={a.issue_url ?? undefined}
                      target="_blank"
                      className="mt-1 inline-block text-[11px] text-blue-600 hover:underline"
                    >
                      GitHub #{a.issue_number}
                    </a>
                  )}
                  {a.adr && (
                    <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-stone-50 p-2 text-[11px] text-stone-600">
                      {a.adr}
                    </pre>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.status === 'proposed' && (
                      <>
                        <textarea
                          value={adrDraft[a.id] ?? ''}
                          onChange={e => setAdrDraft(p => ({ ...p, [a.id]: e.target.value }))}
                          placeholder="ADR / 技术方案"
                          rows={2}
                          className="w-full rounded-lg border border-stone-200 px-2 py-1 text-[12px]"
                        />
                        <button
                          onClick={() => actApproval(a.id, 'adr', { adr: adrDraft[a.id] ?? '' })}
                          disabled={!(adrDraft[a.id] ?? '').trim()}
                          className="rounded bg-stone-800 px-3 py-1 text-[12px] text-white disabled:opacity-40"
                        >
                          提交 ADR
                        </button>
                        <button onClick={() => actApproval(a.id, 'reject')} className="rounded border border-stone-300 px-3 py-1 text-[12px]">驳回</button>
                      </>
                    )}
                    {a.status === 'adr_ready' && (
                      <>
                        <button onClick={() => actApproval(a.id, 'approve')} className="rounded bg-emerald-700 px-3 py-1 text-[12px] text-white">批准</button>
                        <button onClick={() => actApproval(a.id, 'reject')} className="rounded border border-stone-300 px-3 py-1 text-[12px]">驳回</button>
                      </>
                    )}
                    {a.status === 'approved' && (
                      <button onClick={() => actApproval(a.id, 'implement')} className="rounded bg-stone-800 px-3 py-1 text-[12px] text-white">开始实现</button>
                    )}
                    {a.status === 'implementing' && (
                      <button onClick={() => actApproval(a.id, 'done')} className="rounded bg-stone-800 px-3 py-1 text-[12px] text-white">标记完成</button>
                    )}
                    {a.status === 'rejected' && (
                      <button onClick={() => actApproval(a.id, 'reopen')} className="rounded border border-stone-300 px-3 py-1 text-[12px]">重新打开</button>
                    )}
                  </div>
                  {a.approved_by && (
                    <div className="mt-2 text-[10px] text-stone-400">approved by {a.approved_by}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'ledger' && (
            <div className="mx-auto max-w-3xl p-4">
              <h2 className="mb-1 text-sm font-semibold text-stone-600">台账 · GitHub 锚定</h2>
              <p className="mb-3 text-[11px] text-stone-400">
                pending/in_progress 必须有 GitHub issue；issue 关闭后 60 秒内自动变 Done。
              </p>
              {cost && (
                <div className="mb-3 rounded-lg border border-stone-200 bg-white p-3 text-[12px] text-stone-600">
                  本月：<b>{cost.tokens_used}</b> tokens / <b>${cost.cost_used}</b>
                  {' · '}预算 {cost.token_budget || '∞'} tokens / {cost.cost_budget || '∞'}
                  {cost.blocked ? (
                    <span className="ml-2 rounded bg-rose-50 px-2 py-0.5 text-rose-700">预算已耗尽</span>
                  ) : cost.warning ? (
                    <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-amber-700">80% 警告</span>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input value={budgetTokens} onChange={e => setBudgetTokens(e.target.value)} className="w-28 rounded border border-stone-200 px-2 py-1 text-[11px]" placeholder="token 预算" />
                    <input value={budgetCost} onChange={e => setBudgetCost(e.target.value)} className="w-24 rounded border border-stone-200 px-2 py-1 text-[11px]" placeholder="USD 预算" />
                    <button onClick={saveBudget} className="rounded bg-stone-800 px-2 py-1 text-[11px] text-white">保存预算</button>
                    {budgetMsg && <span className="text-[11px] text-stone-400">{budgetMsg}</span>}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {ledger.map((a: any) => (
                  <div key={a.id} className="rounded-lg border border-stone-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] text-stone-800">{a.description}</p>
                      <span
                        className={
                          'shrink-0 rounded px-2 py-0.5 text-[10px] ' +
                          (a.status === 'done'
                            ? 'bg-emerald-50 text-emerald-700'
                            : a.status === 'failed'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-700')
                        }
                      >
                        {a.status}
                      </span>
                    </div>
                    {a.github_issue_number ? (
                      <a
                        href={a.github_issue_url}
                        target="_blank"
                        className="mt-1 inline-block text-[11px] text-blue-600 hover:underline"
                      >
                        #{a.github_issue_number} {a.github_issue_url}
                      </a>
                    ) : (
                      <span className="mt-1 block text-[11px] text-rose-500">
                        缺少 GitHub issue
                      </span>
                    )}
                  </div>
                ))}
                {ledger.length === 0 && (
                  <div className="text-[12px] text-stone-400">还没有台账项。</div>
                )}
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
                    <div className="mt-2 space-y-1">
                      <select
                        value={f.primary_model ?? f.model_name ?? ''}
                        onChange={e => void setModel(f.id, 'primary_model', e.target.value)}
                        className="w-full rounded border border-stone-200 px-2 py-1 text-[11px]"
                      >
                        <option value="">主模型：全局路由</option>
                        {models.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.provider}/{m.model_name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={f.backup_model ?? ''}
                        onChange={e => void setModel(f.id, 'backup_model', e.target.value)}
                        className="w-full rounded border border-stone-200 px-2 py-1 text-[11px]"
                      >
                        <option value="">备用模型：无 failover</option>
                        {models.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.provider}/{m.model_name}
                          </option>
                        ))}
                      </select>
                    </div>
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

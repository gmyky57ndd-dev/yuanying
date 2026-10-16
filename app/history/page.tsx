'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithTimeout, API_BASE } from '@/lib/api';
import {
  buildActivityStream,
  formatDuration,
  StreamEntry,
} from '@/lib/activity-stream';

type DayAgg = {
  date: string;
  water: number;
  steps: number;
  notes: number;
  chats: number;
  reminders: { shown: number; acted: number };
  signals: number;
};

type Signal = {
  id: number;
  name: string;
  value: any;
  context: Record<string, any>;
  created_at: string;
};

type DayDetail = {
  date: string;
  timezone: string;
  signals: Signal[];
  notes: Array<{ id: number; text: string; at: string }>;
  reminders: Array<{
    id: number;
    name: string;
    scheduled_at: string;
    shown_at: string | null;
    acted_at: string | null;
    dismissed_at: string | null;
  }>;
  messages: Array<{ role: string; content: string; created_at: string }>;
  summary: any;
};

type NoteHit = { id: number; text: string; at: string; date: string };

const EVENT_LABEL: Record<string, string> = {
  wake: '起床',
  sleep: '入睡',
  water: '喝水',
  brief_wake: '短暂唤醒',
  reminder_acted: '提醒响应',
};

function hm(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryPage() {
  const [days, setDays] = useState<DayAgg[]>([]);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<NoteHit[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [auditOpen, setAuditOpen] = useState(false);

  const loadDays = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/history/days`, {});
      const d = await r.json();
      setDays(d.days ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDays();
  }, [loadDays]);

  async function openDay(date: string) {
    setHits(null);
    setExpanded({});
    setAuditOpen(false);
    try {
      const r = await fetchWithTimeout(
        `${API_BASE}/api/history/day?date=${date}`,
        {}
      );
      const d = await r.json();
      if (!d.error) setDetail(d);
    } catch {}
  }

  async function doSearch() {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    try {
      const r = await fetchWithTimeout(
        `${API_BASE}/api/history/search?q=${encodeURIComponent(q)}`,
        {}
      );
      const d = await r.json();
      if (d.type === 'date') {
        openDay(d.date);
        return;
      }
      setHits(d.notes ?? []);
    } catch {}
  }

  function toggle(id: string) {
    setExpanded(e => ({ ...e, [id]: !e[id] }));
  }

  // ----- Detail view -------------------------------------------------------
  if (detail) {
    const s = detail.summary;
    const stream: StreamEntry[] = buildActivityStream(detail.signals);
    return (
      <div className="min-h-[100dvh] bg-stone-950 text-stone-100 px-4 py-5">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setDetail(null)}
            className="text-xs text-stone-400"
          >
            ← 返回
          </button>
          <div className="text-sm text-stone-300">{detail.date}</div>
        </div>

        {s && (
          <section className="mb-4 text-[13px] text-stone-300">
            <div className="text-[11px] text-stone-600 mb-1">概要</div>
            起床 {hm(s.wake?.at)} · 入睡 {hm(s.sleep?.at)} · 喝水{' '}
            {s.water?.count ?? 0}/{s.water?.target ?? 6} · 起身{' '}
            {s.standup?.count ?? 0}/{s.standup?.target ?? 8} · 维生素{' '}
            {s.vitamin?.done ? '✓' : '--'}
          </section>
        )}

        <section className="mb-4">
          <div className="text-[11px] text-stone-600 mb-1">活动</div>
          {stream.length === 0 ? (
            <div className="text-[13px] text-stone-600">没有记录。</div>
          ) : (
            <ul className="text-[13px] text-stone-300 space-y-0.5">
              {stream.map(e => {
                if (e.kind === 'note') {
                  const open = !!expanded[e.id];
                  return (
                    <li key={e.id}>
                      <button
                        onClick={() => toggle(e.id)}
                        className="w-full text-left flex gap-2"
                      >
                        <span className="text-stone-600 w-12 shrink-0">
                          {hm(e.at)}
                        </span>
                        <span className="shrink-0">笔记</span>
                        <span
                          className={
                            open
                              ? 'text-stone-300 whitespace-pre-wrap break-words'
                              : 'text-stone-400 truncate'
                          }
                        >
                          {open ? e.text : `“${e.text}”`}
                        </span>
                      </button>
                    </li>
                  );
                }
                if (e.kind === 'apps') {
                  const open = !!expanded[e.id];
                  return (
                    <li key={e.id}>
                      <button
                        onClick={() => toggle(e.id)}
                        className="w-full text-left flex gap-2"
                      >
                        <span className="text-stone-600 w-24 shrink-0">
                          {hm(e.start)}–{hm(e.end)}
                        </span>
                        <span>
                          应用会话 (约 {formatDuration(e.minutes)},{' '}
                          {e.apps.length} 应用)
                          {open ? ' ▾' : ' ▸'}
                        </span>
                      </button>
                      {open && (
                        <ul className="ml-24 mt-0.5 text-stone-500 space-y-0.5">
                          {e.apps.map(a => (
                            <li key={a.package} className="flex gap-2">
                              <span className="flex-1 truncate">{a.name}</span>
                              <span>{a.minutes}m</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                }
                if (e.kind === 'steps') {
                  return (
                    <li key={e.id} className="flex gap-2">
                      <span className="text-stone-600 w-12 shrink-0">
                        {hm(e.at)}
                      </span>
                      <span>步数 {e.value}</span>
                    </li>
                  );
                }
                return (
                  <li key={e.id} className="flex gap-2">
                    <span className="text-stone-600 w-12 shrink-0">
                      {hm(e.at)}
                    </span>
                    <span>{EVENT_LABEL[e.name] ?? e.name}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {detail.reminders.length > 0 && (
          <section className="mb-4">
            <button
              onClick={() => setAuditOpen(o => !o)}
              className="text-[11px] text-stone-600"
            >
              提醒记录 (audit) {auditOpen ? '▾' : '▸'}
            </button>
            {auditOpen && (
              <ul className="mt-1 text-[13px] text-stone-400 space-y-0.5">
                {detail.reminders.map(r => (
                  <li key={r.id} className="flex gap-2">
                    <span className="text-stone-600 w-12 shrink-0">
                      {hm(r.scheduled_at)}
                    </span>
                    <span>{r.name}</span>
                    <span className="text-stone-500">
                      {r.acted_at
                        ? `已做 ${hm(r.acted_at)}`
                        : r.dismissed_at
                          ? '忽略'
                          : r.shown_at
                            ? '已提醒'
                            : '未提醒'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {detail.messages.length > 0 && (
          <section className="mb-4">
            <div className="text-[11px] text-stone-600 mb-1">对话</div>
            <ul className="text-[13px] space-y-1">
              {detail.messages.map((m, i) => (
                <li
                  key={i}
                  className={
                    m.role === 'user' ? 'text-stone-200' : 'text-stone-400'
                  }
                >
                  <span className="text-stone-600 mr-2">{hm(m.created_at)}</span>
                  <span className="whitespace-pre-wrap break-words">
                    {m.content}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // ----- List view ---------------------------------------------------------
  return (
    <div className="min-h-[100dvh] bg-stone-950 text-stone-100 px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <a href="/" className="text-xs text-stone-400">
          ← 首页
        </a>
        <div className="text-sm text-stone-300">历史</div>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="搜索笔记，或输入日期 2026-10-15"
          className="flex-1 bg-stone-900 border border-stone-800 rounded-full px-4 py-2 text-sm outline-none focus:border-stone-600"
        />
        <button
          onClick={doSearch}
          className="bg-stone-700 rounded-full px-4 text-sm"
        >
          搜
        </button>
      </div>

      {hits && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-stone-600">
              笔记 {hits.length} 条
            </span>
            <button
              onClick={() => setHits(null)}
              className="text-[11px] text-stone-500"
            >
              清除
            </button>
          </div>
          {hits.length === 0 ? (
            <div className="text-xs text-stone-600">没有匹配的笔记。</div>
          ) : (
            <ul className="text-[13px] text-stone-300 space-y-1">
              {hits.map(h => (
                <li key={h.id}>
                  <button
                    onClick={() => openDay(h.date)}
                    className="text-left w-full"
                  >
                    <span className="text-stone-600 mr-2">{h.date}</span>
                    <span className="whitespace-pre-wrap break-words">
                      {h.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-stone-600">加载中…</div>
      ) : days.length === 0 ? (
        <div className="text-xs text-stone-600">还没有记录。</div>
      ) : (
        <ul className="divide-y divide-stone-900">
          {days.map(d => (
            <li key={d.date}>
              <button
                onClick={() => openDay(d.date)}
                className="w-full text-left py-2.5 flex items-center justify-between"
              >
                <span className="text-[13px] text-stone-200">{d.date}</span>
                <span className="text-[11px] text-stone-500">
                  喝水 {d.water} · 步 {d.steps} · 笔记 {d.notes} · 提醒{' '}
                  {d.reminders.acted}/{d.reminders.shown}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

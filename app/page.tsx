'use client';

import { useState, useEffect, useRef } from 'react';
import { SignalButton } from '@/components/SignalButton';
import { postChat, fetchWithTimeout, API_BASE } from '@/lib/api';
import {
  buildActivityStream,
  formatDuration,
  StreamEntry,
} from '@/lib/activity-stream';

type Message = { role: 'user' | 'assistant'; content: string };
type Signal = {
  id: number;
  name: string;
  type: string;
  value: any;
  created_at: string;
  context: Record<string, any>;
};

function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SIGNALS = ['wake', 'sleep', 'water'] as const;

const EVENT_LABEL: Record<string, string> = {
  wake: '起床',
  sleep: '入睡',
  water: '喝水',
  brief_wake: '短暂唤醒',
  reminder_acted: '提醒响应',
};

// B-19: timezone offset helper for the PWA exception writer.
function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const p = dtf.formatToParts(at);
  const get = (t: string) => p.find(x => x.type === t)?.value ?? '0';
  let h = parseInt(get('hour'), 10);
  if (h === 24) h = 0;
  const asUtc = Date.UTC(
    +get('year'),
    +get('month') - 1,
    +get('day'),
    h,
    +get('minute'),
    +get('second')
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [todaySignals, setTodaySignals] = useState<Signal[]>([]);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ value: number; goal: number } | null>(
    null
  );
  const [notes, setNotes] = useState<Array<{ id: number; text: string }>>([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteListening, setNoteListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const noteRecRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const sessionIdRef = useRef<string>('');
  if (!sessionIdRef.current) {
    const c = typeof crypto !== 'undefined' ? (crypto as any) : undefined;
    sessionIdRef.current = c?.randomUUID?.() ?? `s-${Date.now()}`;
  }

  useEffect(() => {
    // ES-009 §1: chat is scoped to today (never scrolls before 00:00 local).
    fetchWithTimeout(`${API_BASE}/api/history?today=1`, {})
      .then(r => r.json())
      .then(d => setMessages(d.messages ?? []))
      .catch(() => {});
    loadSignals();
    loadSteps();
    loadNotes();
  }, []);

  useEffect(() => {
    setVoiceSupported(
      !!(
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition
      )
    );
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Refresh today's steps when the app returns to the foreground.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadSteps();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // B-19: exception timezone writer — the collector is the primary writer;
  // the PWA updates config.timezone only on a >1h mismatch with the device.
  useEffect(() => {
    (async () => {
      try {
        const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!deviceTz) return;
        const r = await fetchWithTimeout(`${API_BASE}/api/config`, {});
        const cfg = await r.json();
        const cfgTz =
          typeof cfg.timezone === 'string' ? cfg.timezone : 'Asia/Shanghai';
        if (
          deviceTz !== cfgTz &&
          Math.abs(tzOffsetMinutes(deviceTz) - tzOffsetMinutes(cfgTz)) > 60
        ) {
          await fetchWithTimeout(`${API_BASE}/api/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: deviceTz }),
          });
        }
      } catch {}
    })();
  }, []);

  async function loadSignals() {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/signal`, {});
      const d = await r.json();
      setTodaySignals(d.signals ?? []);
    } catch {}
  }

  async function loadSteps() {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/steps`, {});
      const d = await r.json();
      setSteps({ value: d.steps ?? 0, goal: d.goal ?? 5000 });
    } catch {}
  }

  async function loadNotes() {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/note`, {});
      const d = await r.json();
      setNotes(d.notes ?? []);
    } catch {}
  }

  async function saveNote() {
    const text = noteText.trim();
    if (!text) return;
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        alert('保存失败');
        return;
      }
      setNoteText('');
      setNoteOpen(false);
      loadNotes();
      loadSignals();
    } catch {
      alert('保存失败');
    }
  }

  function startNoteVoice() {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setNoteText(prev => (prev ? prev + ' ' : '') + t);
    };
    rec.onend = () => setNoteListening(false);
    rec.onerror = () => setNoteListening(false);
    noteRecRef.current = rec;
    rec.start();
    setNoteListening(true);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput('');
    setError(null);
    setMessages(m => [...m, { role: 'user', content }]);
    setSending(true);

    try {
      const d = await postChat(content, sessionIdRef.current);
      if (d.reply) {
        setMessages(m => [...m, { role: 'assistant', content: d.reply }]);
      } else {
        setMessages(m => [
          ...m,
          { role: 'assistant', content: '…（信号中断）' },
        ]);
      }
    } catch {
      setError('连接失败');
      setMessages(m => [
        ...m,
        { role: 'assistant', content: '…（连接失败）' },
      ]);
    } finally {
      setSending(false);
      loadSignals();
    }
  }

  async function logSignal(name: string) {
    // 1. 乐观更新：立即反馈，不等服务器
    const optimistic: Signal = {
      id: -Date.now(),
      name,
      type: name === 'water' ? 'count' : 'event',
      value: name === 'water' ? 1 : true,
      created_at: new Date().toISOString(),
      context: {},
    };
    setTodaySignals(prev => [...prev, optimistic]);
    setError(null);

    // 2. 发送请求（绝对路径，避免 standalone 模式解析错误）
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}) as any);
        console.error('signal failed:', res.status, err);
        alert(`信号记录失败：${res.status}\n${err.error ?? '未知错误'}`);
        setTodaySignals(prev => prev.filter(s => s.id !== optimistic.id));
        return;
      }

      await loadSignals();
    } catch (err) {
      console.error('signal network error:', err);
      alert('网络错误，信号未记录');
      setTodaySignals(prev => prev.filter(s => s.id !== optimistic.id));
    }
  }

  function isLogged(name: string) {
    return todaySignals.some(s => s.name === name);
  }

  const waterCount = todaySignals.filter(s => s.name === 'water').length;
  const stream: StreamEntry[] = buildActivityStream(todaySignals);

  function toggle(id: string) {
    setExpanded(e => ({ ...e, [id]: !e[id] }));
  }

  // ES-012 §2/§3: edit a note's tags / feedback flag (optional, never required).
  async function patchNote(id: number, body: Record<string, unknown>) {
    try {
      await fetchWithTimeout(`${API_BASE}/api/note/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      loadSignals();
    } catch {}
  }
  function addTag(id: number, tags: string[]) {
    const t = (window.prompt('标签') ?? '').trim();
    if (!t) return;
    patchNote(id, { tags: [...tags, t] });
  }
  function removeTag(id: number, tags: string[], t: string) {
    patchNote(id, { tags: tags.filter(x => x !== t) });
  }

  function startVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input not supported in this browser.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      send(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-stone-950 text-stone-100">
      {/* Avatar */}
      <div className="flex flex-col items-center pt-5 pb-2 shrink-0">
        <img
          src="/avatar.png"
          alt="元婴"
          className="w-16 h-16 rounded-full bg-stone-800 object-cover"
          onError={e => {
            (e.target as HTMLImageElement).style.opacity = '0';
          }}
        />
        <div className="text-[10px] text-stone-500 mt-1 tracking-widest">
          元婴
        </div>
        <div className="absolute right-4 top-5 flex gap-3 text-xs">
          <a href="/history" className="text-stone-600">
            历史
          </a>
          <a href="/feedback" className="text-stone-600">
            反馈
          </a>
          <a href="/settings" className="text-stone-600">
            设置
          </a>
        </div>
      </div>

      {/* Signals */}
      <div className="flex gap-2 justify-center px-4 pb-3 shrink-0">
        {SIGNALS.map(name => (
          <SignalButton
            key={name}
            name={name}
            logged={isLogged(name)}
            count={name === 'water' ? waterCount : undefined}
            onClick={() => logSignal(name)}
          />
        ))}
      </div>

      {/* Steps */}
      {steps && (
        <div className="text-center text-[11px] text-stone-500 pb-2 shrink-0">
          步数 {steps.value} / {steps.goal}
        </div>
      )}

      {/* Notes — capture rides on the existing 记一笔 button (no new surface) */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex items-center justify-between text-[11px] text-stone-500">
          <button
            onClick={() => setNoteOpen(o => !o)}
            className="text-stone-400"
          >
            记一笔
          </button>
          <span>笔记 {notes.length}</span>
        </div>
        {noteOpen && (
          <div className="mt-2 space-y-2">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onCompositionEnd={e => setNoteText((e.target as HTMLTextAreaElement).value)}
              rows={3}
              placeholder="记点什么…"
              lang="zh-CN"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-stone-600"
            />
            <div className="flex gap-2 justify-end items-center">
              {voiceSupported && (
                <button
                  onClick={startNoteVoice}
                  aria-label="note-voice"
                  className={`w-9 h-9 rounded-full text-sm ${
                    noteListening
                      ? 'bg-red-900 text-red-200'
                      : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  ◉
                </button>
              )}
              <button
                onClick={() => {
                  setNoteOpen(false);
                  setNoteText('');
                }}
                className="text-xs text-stone-500 px-2"
              >
                取消
              </button>
              <button
                onClick={saveNote}
                disabled={!noteText.trim()}
                className="bg-stone-700 disabled:opacity-40 rounded-full px-4 py-1.5 text-xs"
              >
                保存
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Today — raw activity stream (ES-009 §1) */}
      <div className="px-4 pb-2 shrink-0 max-h-28 overflow-y-auto text-[12px]">
        <div className="text-[11px] text-stone-600 mb-1">今天</div>
        {stream.length === 0 ? (
          <div className="text-stone-600">今天还没有记录。</div>
        ) : (
          <ul className="space-y-0.5 text-stone-300">
            {stream.map(e => {
              if (e.kind === 'note') {
                const open = !!expanded[e.id];
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => toggle(e.id)}
                      className="w-full text-left flex gap-2"
                    >
                      <span className="text-stone-600 w-11 shrink-0">
                        {hm(e.at)}
                      </span>
                      <span className="shrink-0">笔记</span>
                      <span
                        className={
                          open
                            ? 'text-stone-300 whitespace-pre-wrap break-words'
                            : 'text-stone-500 truncate'
                        }
                      >
                        {open ? e.text : `“${e.text}”`}
                      </span>
                    </button>
                    {open && (
                      <div className="ml-[52px] mt-1 flex flex-wrap gap-1 items-center">
                        {e.tags.map(t => (
                          <span
                            key={t}
                            className="text-[10px] bg-stone-800 text-stone-400 rounded-full px-2 py-0.5"
                          >
                            #{t}
                            <button
                              onClick={() => removeTag(e.ref, e.tags, t)}
                              className="ml-1 text-stone-500"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <button
                          onClick={() => addTag(e.ref, e.tags)}
                          className="text-[10px] text-stone-500 border border-stone-800 rounded-full px-2 py-0.5"
                        >
                          ＋标签
                        </button>
                        {e.feedback ? (
                          <span className="text-[10px] text-emerald-500">
                            反馈
                          </span>
                        ) : e.feedbackSuggested ? (
                          <button
                            onClick={() => patchNote(e.ref, { feedback: true })}
                            className="text-[10px] text-amber-500"
                          >
                            这像反馈，标记?
                          </button>
                        ) : null}
                      </div>
                    )}
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
                      <span className="text-stone-600 w-11 shrink-0">
                        {hm(e.start)}
                      </span>
                      <span>
                        应用会话 (约 {formatDuration(e.minutes)},{' '}
                        {e.apps.length} 应用)
                        {open ? ' ▾' : ' ▸'}
                      </span>
                    </button>
                    {open && (
                      <ul className="ml-[52px] mt-0.5 text-stone-500 space-y-0.5">
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
                    <span className="text-stone-600 w-11 shrink-0">
                      {hm(e.at)}
                    </span>
                    <span>步数 {e.value}</span>
                  </li>
                );
              }
              return (
                <li key={e.id} className="flex gap-2">
                  <span className="text-stone-600 w-11 shrink-0">{hm(e.at)}</span>
                  <span>{EVENT_LABEL[e.name] ?? e.name}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-center text-xs text-red-400 pb-2 shrink-0">
          {error}
        </div>
      )}

      {/* Chat (today only) */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-2 border-t border-stone-900 pt-2">
        {messages.length === 0 && (
          <div className="text-center text-stone-600 text-xs pt-8">
            说点什么。
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-[15px] leading-snug whitespace-pre-wrap break-words ${
              m.role === 'user'
                ? 'ml-auto bg-stone-700 text-stone-50'
                : 'mr-auto bg-stone-800 text-stone-100'
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="mr-auto bg-stone-800 px-3.5 py-2 rounded-2xl text-stone-500 text-[15px]">
            …
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 p-3 border-t border-stone-800 shrink-0">
        <button
          onClick={startVoice}
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
            listening
              ? 'bg-red-900 text-red-200'
              : 'bg-stone-800 text-stone-300'
          }`}
          aria-label="voice"
        >
          ◉
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="…"
          lang="zh-CN"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="flex-1 bg-stone-900 border border-stone-800 rounded-full px-4 py-2 text-[15px] outline-none focus:border-stone-600"
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          className="bg-stone-700 disabled:opacity-40 rounded-full px-4 text-sm"
        >
          →
        </button>
      </div>
    </div>
  );
}

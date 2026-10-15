'use client';

import { useState, useEffect, useRef } from 'react';
import { SignalButton } from '@/components/SignalButton';
import { postChat, fetchWithTimeout, API_BASE } from '@/lib/api';

type Message = { role: 'user' | 'assistant'; content: string };
type Signal = {
  id: number;
  name: string;
  type: string;
  value: any;
  created_at: string;
  context: Record<string, any>;
};

const SIGNALS = ['wake', 'sleep', 'water'] as const;

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const sessionIdRef = useRef<string>('');
  if (!sessionIdRef.current) {
    const c = typeof crypto !== 'undefined' ? (crypto as any) : undefined;
    sessionIdRef.current = c?.randomUUID?.() ?? `s-${Date.now()}`;
  }

  useEffect(() => {
    fetchWithTimeout(`${API_BASE}/api/history`, {})
      .then(r => r.json())
      .then(d => setMessages(d.messages ?? []))
      .catch(() => {});
    loadSignals();
    loadSteps();
    // Generate today's summary on first open (idempotent server-side).
    fetchWithTimeout(`${API_BASE}/api/summary/today`, {}).catch(() => {});
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
        // 回滚
        setTodaySignals(prev => prev.filter(s => s.id !== optimistic.id));
        return;
      }

      // 3. 用服务器数据校准（幂等去重后）
      await loadSignals();
    } catch (err) {
      console.error('signal network error:', err);
      alert('网络错误，信号未记录');
      setTodaySignals(prev => prev.filter(s => s.id !== optimistic.id));
    }
  }

  function isLogged(name: string) {
    // todaySignals is already scoped server-side (see /api/signal GET).
    // Do not re-filter on the client — the browser timezone may differ.
    return todaySignals.some(s => s.name === name);
  }

  const waterCount = todaySignals.filter(s => s.name === 'water').length;

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
        <a
          href="/settings"
          className="absolute right-4 top-5 text-xs text-stone-600"
        >
          设置
        </a>
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
        <div className="text-center text-[11px] text-stone-500 pb-2">
          步数 {steps.value} / {steps.goal}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center text-xs text-red-400 pb-2">{error}</div>
      )}

      {/* Chat */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-2">
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

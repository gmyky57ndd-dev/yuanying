'use client';

import { useState, useEffect, useRef } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };
type Signal = { name: string; created_at: string };

const SIGNALS = ['wake', 'sleep', 'water', 'sit'] as const;

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [todaySignals, setTodaySignals] = useState<Signal[]>([]);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    fetch('/api/history')
      .then(r => r.json())
      .then(d => setMessages(d.messages ?? []))
      .catch(() => {});
    loadSignals();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function loadSignals() {
    try {
      const r = await fetch('/api/signal');
      const d = await r.json();
      setTodaySignals(d.signals ?? []);
    } catch {}
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', content }]);
    setSending(true);

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      });
      const d = await r.json();
      if (d.reply) {
        setMessages(m => [...m, { role: 'assistant', content: d.reply }]);
      } else {
        setMessages(m => [
          ...m,
          { role: 'assistant', content: '…（信号中断）' },
        ]);
      }
    } catch {
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
    await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    loadSignals();
  }

  function isLogged(name: string) {
    const today = new Date().toDateString();
    return todaySignals.some(
      s =>
        s.name === name &&
        new Date(s.created_at).toDateString() === today
    );
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
      </div>

      {/* Signals */}
      <div className="flex gap-2 justify-center px-4 pb-3 shrink-0">
        {SIGNALS.map(name => {
          const logged = isLogged(name);
          return (
            <button
              key={name}
              onClick={() => logSignal(name)}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                logged
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-800'
                  : 'bg-stone-800 text-stone-300 border border-stone-700 active:bg-stone-700'
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

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

'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/status`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setState(d.authenticated ? 'in' : 'out'))
      .catch(() => setState('out'));
  }, []);

  async function login() {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (r.ok) setState('in');
      else alert('密码错误');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'checking') return null;

  if (state === 'out') {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-stone-950 text-stone-100 gap-4 px-8">
        <div className="text-sm text-stone-500 tracking-widest">元婴</div>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          placeholder="密码"
          className="w-full max-w-xs bg-stone-900 border border-stone-800 rounded-full px-4 py-2 text-sm outline-none focus:border-stone-600"
        />
        <button
          onClick={login}
          disabled={busy || !pw}
          className="bg-stone-700 disabled:opacity-40 rounded-full px-6 py-2 text-sm"
        >
          进入
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

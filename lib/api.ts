import { processDataStream } from 'ai';

export const API_BASE =
  typeof window !== 'undefined' ? window.location.origin : '';

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  ms = 60000
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function postChat(message: string, session_id?: string) {
  const res = await fetchWithTimeout(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  if (!res.body) throw new Error('empty response');

  let reply = '';
  let streamError: string | null = null;
  let pushFailure: string | null = null;

  await processDataStream({
    stream: res.body,
    onTextPart: text => {
      reply += text;
    },
    onErrorPart: error => {
      streamError = error;
    },
    onDataPart: data => {
      const value = (Array.isArray(data) ? data[0] : data) as any;
      if (value?.type === 'push_to_dev' && value.success === false) {
        pushFailure = String(value.error ?? 'unknown error');
      }
    },
  });

  if (streamError) throw new Error(streamError);
  if (pushFailure) {
    throw new Error(`GitHub Issue 未创建：${pushFailure}`);
  }

  return { reply };
}

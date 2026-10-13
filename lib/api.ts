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

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  return res.json();
}

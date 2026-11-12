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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableNetworkError(e: any): boolean {
  if (e?.retryable === true) return true;
  const msg = String(e?.message ?? e ?? '');
  return /Failed to fetch|NetworkError|load failed|fetch failed|aborted|timeout|超时|50[234]/i.test(
    msg
  );
}

function stripLeakedMarkers(input: string): string {
  return input
    .replace(/<(tool_calls?|function_calls?)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\|tool_calls?\|>[\s\S]*?<(?:\|\/|\/\|)tool_calls?\|>/gi, '')
    .replace(/<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}[^>]*>/gi, '')
    .replace(/<[｜|]{1,2}[^<>]{0,200}[｜|]{1,2}>/g, '')
    .replace(/^\s*[｜|]{2}\s*DSML.*$/gim, '')
    .trim();
}

async function postChatOnce(
  body: Record<string, unknown>,
  onToolEvent?: (event: any) => void
): Promise<{ reply: string }> {
  // ES-084: long tool runs can exceed 60s; allow 180s. The server also sends a
  // 5s keep-alive, so a proxy drop is distinguishable from a slow model.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    const aborted = e?.name === 'AbortError';
    const err: any = new Error(
      aborted ? '请求超时（180 秒），请重试' : e?.message ?? '网络连接失败'
    );
    err.retryable = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 504) {
      const err: any = new Error('服务器处理超时，请重试');
      err.retryable = true;
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    const err: any = new Error(data?.error ?? `HTTP ${res.status}`);
    err.retryable = res.status >= 500;
    throw err;
  }
  if (!res.body) {
    const err: any = new Error('empty response');
    err.retryable = true;
    throw err;
  }

  let reply = '';
  let streamError: string | null = null;
  let pushFailure: string | null = null;

  try {
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
        if (value?.type === 'assistant_text' && typeof value.text === 'string') {
          reply = value.text;
        }
        if (value?.type === 'push_to_dev') {
          onToolEvent?.(value);
          if (value.success === false) {
            pushFailure = String(value.error ?? 'unknown error');
          }
        }
      },
    });
  } catch (e: any) {
    const err: any = new Error(
      /abort/i.test(String(e?.name)) ? '连接中断，请重试' : e?.message ?? '流式连接中断'
    );
    err.retryable = true;
    err.partial = reply;
    throw err;
  }

  // ES-067: defence in depth — the server strips markers before persisting; the
  // client strips again so a leaked marker can never be rendered as chat text.
  const before = reply;
  reply = stripLeakedMarkers(reply);
  if (reply !== before) console.warn('stripped leaked tool-call markers');

  if (streamError) {
    const err: any = new Error(streamError);
    err.partial = reply;
    throw err;
  }
  if (pushFailure) {
    const err: any = new Error(`GitHub Issue 未创建：${pushFailure}`);
    err.partial = reply;
    throw err;
  }

  return { reply };
}

/**
 * ES-084: retry a network/504 failure before any text (1s, then 2s). A partial
 * response is never replayed blindly — the caller keeps what it received.
 */
export async function postChat(
  message: string,
  session_id?: string,
  onToolEvent?: (event: any) => void,
  device_id?: string,
  fenshenId?: string,
  projectId?: string,
  activeFenshenIds?: string[]
) {
  // ES-062: a coarse device label; never a fingerprint.
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const device = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Macintosh/i.test(ua)
        ? 'Mac'
        : 'Web';
  const body = {
    message,
    session_id,
    device,
    device_id,
    fenshen_id: fenshenId || undefined,
    project_id: projectId || undefined,
    active_fenshen_ids: activeFenshenIds?.length ? activeFenshenIds : undefined,
  };

  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await postChatOnce(body, onToolEvent);
    } catch (e: any) {
      lastError = e;
      if (e?.partial || !isRetryableNetworkError(e) || attempt >= 2) throw e;
      onToolEvent?.({ type: 'retry', attempt: attempt + 1 });
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

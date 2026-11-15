/** ES-090: fetch a public http(s) page and return readable plain text. */
export type FetchedPage = {
  url: string;
  title: string;
  text: string;
  fetched_at: string;
};

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 20_000;

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

export async function fetchUrlContent(rawUrl: string): Promise<FetchedPage> {
  const url = new URL(String(rawUrl ?? '').trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('only http(s) URLs are allowed');
  }
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error('private/local URLs are not allowed');
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'yuanying-fetch-url/1.0',
      Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.5',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error(`response too large (${buf.byteLength} bytes; max ${MAX_BYTES})`);
  }
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim().slice(0, 300) : url.hostname;

  let text = raw;
  if (contentType.includes('html') || /<html[\s>]/i.test(raw)) {
    text = raw
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|pre|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
  }
  text = decodeEntities(text)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);

  return {
    url: res.url || url.toString(),
    title,
    text,
    fetched_at: new Date().toISOString(),
  };
}

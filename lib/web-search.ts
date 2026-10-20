export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchResponse = {
  provider: 'tavily' | 'duckduckgo';
  results: WebSearchResult[];
};

const MAX_RESULTS = 3;
const MAX_SNIPPET_CHARS = 1200;

function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeDdgUrl(href: string): string {
  try {
    const value = href.startsWith('//') ? `https:${href}` : href;
    const url = new URL(value);
    const target = url.searchParams.get('uddg');
    return target ? decodeURIComponent(target) : value;
  } catch {
    return href;
  }
}

async function tavilySearch(
  query: string,
  apiKey: string
): Promise<WebSearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: MAX_RESULTS,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Tavily search failed (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`
    );
  }

  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.slice(0, MAX_RESULTS).map((r: any) => ({
    title: String(r?.title ?? ''),
    url: String(r?.url ?? ''),
    snippet: truncate(String(r?.content ?? '').trim(), MAX_SNIPPET_CHARS),
  }));
}

async function duckDuckGoSearch(query: string): Promise<WebSearchResult[]> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html',
      },
    }
  );

  if (!res.ok) {
    throw new Error(`DuckDuckGo search failed (HTTP ${res.status})`);
  }

  const html = await res.text();
  const results: WebSearchResult[] = [];
  const blockRe =
    /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="result__a"|$)/g;

  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) && results.length < MAX_RESULTS) {
    const url = decodeDdgUrl(match[1]);
    const title = cleanText(match[2]);
    const snippetMatch = match[3].match(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/
    );
    const snippet = snippetMatch ? cleanText(snippetMatch[1]) : '';
    if (url && title) {
      results.push({
        title,
        url,
        snippet: truncate(snippet, MAX_SNIPPET_CHARS),
      });
    }
  }

  return results;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function jinaDuckDuckGoSearch(query: string): Promise<WebSearchResult[]> {
  const res = await fetch(
    `https://r.jina.ai/https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      cache: 'no-store',
      headers: { Accept: 'text/plain' },
    }
  );
  if (!res.ok) {
    throw new Error(`Jina/DDG search failed (HTTP ${res.status})`);
  }

  const text = await res.text();
  const blocks = text.split(/\n## \[/).slice(1);
  const results: WebSearchResult[] = [];

  for (const block of blocks) {
    if (results.length >= MAX_RESULTS) break;
    const titleMatch = block.match(/^([^\]]+)\]\(([^)]+)\)/);
    if (!titleMatch) continue;
    const title = stripMarkdown(decodeHtml(titleMatch[1]));
    const url = decodeDdgUrl(titleMatch[2]);
    if (!url || url.includes('duckduckgo.com')) continue;

    const lines = block
      .split('\n')
      .slice(1)
      .map(stripMarkdown)
      .filter(line => line.length > 0);
    const snippet =
      lines.find(
        line =>
          line.length > 40 &&
          !line.startsWith('http') &&
          !line.includes('duckduckgo.com')
      ) ??
      lines[0] ??
      '';

    results.push({
      title,
      url,
      snippet: truncate(snippet, MAX_SNIPPET_CHARS),
    });
  }

  return results;
}

/** ES-036: read-only web search, Tavily → DuckDuckGo → Jina/DDG. */
export async function webSearch(query: string): Promise<WebSearchResponse> {
  const q = query.trim();
  if (!q) throw new Error('search query is required');

  const failures: string[] = [];
  const tavilyKey = process.env.TAVILY_API_KEY ?? '';

  if (tavilyKey) {
    try {
      const results = await tavilySearch(q, tavilyKey);
      if (results.length > 0) {
        return { provider: 'tavily', results };
      }
      failures.push('tavily: no results');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed';
      failures.push(`tavily: ${msg}`);
      console.warn('Tavily search failed; falling back', msg);
    }
  } else {
    failures.push('tavily: not configured');
  }

  try {
    const results = await duckDuckGoSearch(q);
    if (results.length > 0) {
      return { provider: 'duckduckgo', results };
    }
    failures.push('duckduckgo: no results');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed';
    failures.push(`duckduckgo: ${msg}`);
    console.warn('DuckDuckGo search failed; trying Jina reader', msg);
  }

  try {
    const results = await jinaDuckDuckGoSearch(q);
    if (results.length > 0) {
      return { provider: 'duckduckgo', results };
    }
    failures.push('jina/duckduckgo: no results');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed';
    failures.push(`jina/duckduckgo: ${msg}`);
  }

  throw new Error(`All web search backends failed: ${failures.join('; ')}`);
}

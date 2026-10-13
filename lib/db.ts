import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

    client = createClient(url, key, {
      auth: { persistSession: false },
      global: {
        headers: { 'x-application-name': 'yuanying' },
        // Disable Next.js fetch cache so reads are never stale.
        fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' })) as typeof fetch,
      },
    });
  }
  return client;
}

// Lazy proxy: defers client creation to first use so `next build`
// does not fail when env vars are absent at build time.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getClient();
    const value = (c as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? value.bind(c) : value;
  },
});

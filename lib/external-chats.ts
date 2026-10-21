import { supabase } from './db';

const MAX_CHARS = 200_000;

export type ExternalChat = {
  id: number;
  source: string;
  content: string;
  created_at: string;
};

export async function ingestExternalChat(
  source: string,
  content: string
): Promise<{ success: true; data: { id: number; source: string; chars: number } }> {
  const src = source.trim() || 'external';
  const text = content.trim();
  if (!text) throw new Error('content is required');
  if (Array.from(text).length > MAX_CHARS) {
    throw new Error(`content too large (max ${MAX_CHARS} characters)`);
  }

  const { data, error } = await supabase
    .from('external_chats')
    .insert({ source: src, content: text })
    .select('id')
    .single();
  if (error) throw new Error(`external chat save failed: ${error.message}`);

  return {
    success: true,
    data: { id: data.id, source: src, chars: Array.from(text).length },
  };
}

export async function queryExternalChats(query: string): Promise<{
  success: true;
  data: ExternalChat[];
}> {
  const q = query.trim();
  if (!q) throw new Error('query is required');

  const { data, error } = await supabase
    .from('external_chats')
    .select('id, source, content, created_at')
    .textSearch('search', q, { type: 'websearch', config: 'simple' })
    .order('created_at', { ascending: false })
    .limit(5);

  if (!error && data && data.length > 0) {
    return { success: true, data: data as ExternalChat[] };
  }

  // Simple fallback for languages/queries the tsvector config tokenizes poorly.
  const { data: fallback, error: fallbackError } = await supabase
    .from('external_chats')
    .select('id, source, content, created_at')
    .ilike('content', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(5);

  if (fallbackError) {
    throw new Error(`external chat search failed: ${fallbackError.message}`);
  }
  return { success: true, data: (fallback ?? []) as ExternalChat[] };
}

/**
 * ES-012 §2 / ES-010 §6: lightweight topic-tag extraction. No model call
 * (bounded cost): picks words from the text itself plus any existing tags
 * that appear. Open vocabulary — no fixed taxonomy.
 */

const STOP = new Set([
  // zh
  '今天', '明天', '昨天', '这个', '那个', '一个', '一下', '还是', '就是',
  '然后', '自己', '我们', '你们', '他们', '什么', '怎么', '因为', '所以',
  '可以', '没有', '需要', '觉得', '可能', '应该', '已经', '现在', '不是',
  'the', 'and', 'for', 'that', 'with', 'you', 'have', 'this', 'does',
  'not', 'work', 'will', 'from', 'are', 'was', 'were', 'but', 'can',
]);

function isCJK(s: string): boolean {
  return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(s);
}

function normalize(s: string): string {
  return isCJK(s) ? s : s.toLowerCase();
}

export function extractTags(text: string, existing: string[] = []): string[] {
  const raw = String(text ?? '');
  const tokens = raw
    .split(/[\s,，。、；;：:!！?？/\\|"'“”‘’()（）\[\]{}<>#@~`+*=]+/)
    .map(t => t.replace(/^[.\-]+|[.\-]+$/g, '').trim())
    .filter(Boolean);

  const freq = new Map<string, number>();
  for (const t of tokens) {
    const key = normalize(t);
    const ok = isCJK(t) ? t.length >= 2 : key.length >= 3;
    if (!ok || STOP.has(key) || /^\d+$/.test(key)) continue;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  const ranked = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0]);

  // Existing tags that appear in this text come first (vocabulary continuity).
  const lower = raw.toLowerCase();
  const reused = existing
    .map(t => t.trim())
    .filter(t => t.length > 0 && lower.includes(t.toLowerCase()));

  const out: string[] = [];
  for (const t of [...reused, ...ranked]) {
    const n = t.trim();
    if (n.length === 0 || out.includes(n)) continue;
    out.push(n);
    if (out.length >= 3) break;
  }
  return out;
}

/** All tags already used across the owner's notes (for autocomplete). */
export function mergeVocabulary(noteTags: string[][]): string[] {
  const set = new Set<string>();
  for (const tags of noteTags) for (const t of tags) set.add(t);
  return Array.from(set).sort();
}

import fs from 'fs';
import path from 'path';

export interface Opinion {
  id: string;
  title: string;
  confidence: number;
  firstObserved: string | null;
  lastEngaged: string | null;
  topic: string | null;
  evidence: string[];
}

function opinionsDir(): string {
  return path.join(process.cwd(), 'core', 'opinions');
}

export function parseOpinions(md: string): Opinion[] {
  const out: Opinion[] = [];
  const blocks = md.split(/^## /m).slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    const heading = lines[0];
    const m = heading.match(/^(O-\d+)\s*[—\-:]\s*(.*)$/);
    if (!m) continue;
    const body = lines.slice(1);
    const pick = (re: RegExp) => {
      const found = body.find(l => re.test(l));
      return found ? found.replace(re, '$1').trim() : null;
    };
    const conf = pick(/Confidence:\s*([0-9.]+)/i);

    const evidence: string[] = [];
    let inEv = false;
    for (const line of body) {
      if (/Evidence:/i.test(line)) {
        inEv = true;
        continue;
      }
      if (inEv) {
        if (/^\s*-\s+/.test(line)) evidence.push(line.trim().replace(/^-\s+/, ''));
        else if (line.trim() === '') inEv = false;
      }
    }

    out.push({
      id: m[1],
      title: m[2].trim(),
      confidence: conf ? parseFloat(conf) : 0.5,
      firstObserved: pick(/First observed:\s*(.+)/i),
      lastEngaged: pick(/Last engaged:\s*(.+)/i),
      topic: pick(/Topic:\s*(.+)/i),
      evidence,
    });
  }
  return out;
}

export function readOpinionsFile(file: string): Opinion[] {
  try {
    const p = path.join(opinionsDir(), file);
    if (!fs.existsSync(p)) return [];
    return parseOpinions(fs.readFileSync(p, 'utf-8'));
  } catch {
    return [];
  }
}

export function readHeld(): Opinion[] {
  return readOpinionsFile('held.md');
}

export function readConfirmed(): Opinion[] {
  return readOpinionsFile('confirmed.md');
}

function topicTokens(o: Opinion): string[] {
  const set = new Set<string>();
  if (o.topic) set.add(o.topic);
  for (const w of o.title.split(/[\s，,、。/]+/)) {
    if (w.length >= 2) set.add(w);
  }
  return Array.from(set);
}

/** Held opinions whose topic matches the current conversation message. */
export function relevantHeld(message: string): Opinion[] {
  if (!message) return [];
  const msg = message.toLowerCase();
  return readHeld().filter(o =>
    topicTokens(o).some(t => t.length >= 2 && msg.includes(t.toLowerCase()))
  );
}

/** Off-limits topics from core/ground-rules.md "## No opinions about". */
export function offLimitsTopics(): string[] {
  try {
    const p = path.join(process.cwd(), 'core', 'ground-rules.md');
    const md = fs.readFileSync(p, 'utf-8');
    const idx = md.search(/^##\s*No opinions about/im);
    if (idx < 0) return [];
    const lines = md.slice(idx).split('\n').slice(1);
    const out: string[] = [];
    for (const line of lines) {
      if (/^##\s/.test(line)) break;
      const m = line.match(/^\s*-\s+(.+)/);
      if (m) {
        const t = m[1].trim();
        if (t && !t.startsWith('(')) out.push(t);
      }
    }
    return out;
  } catch {
    return [];
  }
}

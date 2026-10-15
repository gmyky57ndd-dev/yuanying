#!/usr/bin/env node
// ES-006 P2-02/P2-03 — opinion detector + confirmation transitions.
// Runs as an AGENT BATCH (not on request). core/opinions/*.md are read-only on
// the serverless runtime, so proposals/transitions happen here and are committed.
//
//   node --env-file=.env.local scripts/opinions.mjs detect
//   node --env-file=.env.local scripts/opinions.mjs respond O-001 对
//   node --env-file=.env.local scripts/opinions.mjs respond O-001 不对 "理由"

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const ROOT = process.cwd();
const DIR = path.join(ROOT, 'core', 'opinions');
const FILES = ['held.md', 'confirmed.md', 'rejected.md', 'archive.md'];
const MAX_HELD = 3;
const CONSECUTIVE_DAYS = 5;
const URL = process.env.SUPABASE_DB_URL;

const STOPWORDS = new Set([
  '今天', '明天', '昨天', '还是', '就是', '然后', '这个', '那个', '一个', '一下',
  'the', 'and', 'for', 'that', 'with', 'you', 'have', 'this',
]);

function read(file) {
  const p = path.join(DIR, file);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}
function write(file, content) {
  fs.writeFileSync(path.join(DIR, file), content);
}
function dayKey(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}
function prevDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86400000).toISOString().slice(0, 10);
}
function blocksOf(md) {
  const idx = [...md.matchAll(/^## /gm)].map(m => m.index);
  const headerEnd = idx.length ? idx[0] : md.length;
  const header = md.slice(0, headerEnd);
  const blocks = idx.map((start, i) =>
    md.slice(start, i + 1 < idx.length ? idx[i + 1] : md.length)
  );
  return { header, blocks };
}
function offLimits() {
  const md = read('../ground-rules.md');
  const g = fs.existsSync(path.join(ROOT, 'core', 'ground-rules.md'))
    ? fs.readFileSync(path.join(ROOT, 'core', 'ground-rules.md'), 'utf-8')
    : '';
  const idx = g.search(/^##\s*No opinions about/im);
  if (idx < 0) return [];
  const out = [];
  for (const line of g.slice(idx).split('\n').slice(1)) {
    if (/^##\s/.test(line)) break;
    const m = line.match(/^\s*-\s+(.+)/);
    if (m && !m[1].trim().startsWith('(')) out.push(m[1].trim());
  }
  return out;
}

async function detect(client) {
  const cfg = await client.query(
    "select value from config where key='timezone'"
  );
  const tz =
    typeof cfg.rows[0]?.value === 'string' ? cfg.rows[0].value : 'Asia/Shanghai';

  const notes = await client.query(
    "select created_at, coalesce(value->>'text','') text from signals where name='note' and created_at > now() - interval '21 days' order by created_at asc"
  );
  const usage = await client.query(
    "select created_at from signals where name='app_usage' and created_at > now() - interval '21 days'"
  );

  const notesByDay = new Map();
  for (const r of notes.rows) {
    const d = dayKey(r.created_at, tz);
    if (!notesByDay.has(d)) notesByDay.set(d, []);
    notesByDay.get(d).push(r.text);
  }
  const usageDays = new Set(usage.rows.map(r => dayKey(r.created_at, tz)));

  // longest consecutive run of note-days
  let best = [];
  for (const d of notesByDay.keys()) {
    const run = [d];
    let cur = d;
    while (notesByDay.has(prevDay(cur)) && run.length < 21) {
      cur = prevDay(cur);
      run.unshift(cur);
    }
    if (run.length > best.length) best = run;
  }

  if (best.length < CONSECUTIVE_DAYS) {
    console.log(`detect: no candidate (longest note streak ${best.length} < ${CONSECUTIVE_DAYS})`);
    return;
  }

  // false-positive guard: adjacent activity required on the streak days
  const adjacent = best.every(d => usageDays.has(d));
  if (!adjacent) {
    console.log('detect: note streak present but no adjacent activity — not proposing');
    return;
  }

  // topic = most frequent meaningful token across the streak notes
  const freq = new Map();
  for (const d of best) {
    for (const text of notesByDay.get(d)) {
      for (const tok of String(text).split(/[\s，,、。/]+/)) {
        if (tok.length >= 2 && !STOPWORDS.has(tok)) {
          freq.set(tok, (freq.get(tok) ?? 0) + 1);
        }
      }
    }
  }
  const topic = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!topic) {
    console.log('detect: no topic token — not proposing');
    return;
  }

  // off-limits hard filter (ES-006 §10)
  if (offLimits().some(t => t.includes(topic) || topic.includes(t))) {
    console.log(`detect: topic "${topic}" is off-limits — not proposing`);
    return;
  }

  // dedup against held
  const held = blocksOf(read('held.md'));
  if (held.blocks.some(b => b.includes(`Topic: ${topic}`))) {
    console.log(`detect: already held (${topic})`);
    return;
  }

  // cap: evict oldest to archive
  if (held.blocks.length >= MAX_HELD) {
    const arch = blocksOf(read('archive.md'));
    const evicted = held.blocks.shift();
    write('archive.md', arch.header + arch.blocks.join('') + '\n' + evicted);
    write('held.md', held.header + held.blocks.join(''));
  }

  const allBlocks = FILES.map(f => blocksOf(read(f)).blocks).flat().join('');
  const n = (allBlocks.match(/O-(\d+)/g) ?? []).length + 1;
  const id = `O-${String(n).padStart(3, '0')}`;
  const first = best[0];
  const last = best[best.length - 1];
  const evidence = best
    .map(d => `  - ${d} note: "${(notesByDay.get(d)[0] || '').slice(0, 60)}"`)
    .join('\n');
  const entry = `\n## ${id} — 我们在「${topic}」上原地打转，却把时间花在别的任务\n\n- Confidence: 0.5\n- First observed: ${first}\n- Last engaged: ${last}\n- Topic: ${topic}\n- Evidence:\n${evidence}\n`;

  const cur = blocksOf(read('held.md'));
  write('held.md', (cur.header + cur.blocks.join('') + entry + '\n').replace(/_No held opinions\._\n?/, ''));
  console.log(`detect: proposed ${id} (topic: ${topic})`);
}

function respond(client) {
  const [, , id, response, reason] = process.argv;
  if (!id || !response) {
    console.error('usage: respond <id> <对|不对|有可能> [reason]');
    process.exit(1);
  }
  const held = blocksOf(read('held.md'));
  const i = held.blocks.findIndex(b => new RegExp(`^## ${id}\\b`).test(b));
  if (i < 0) {
    console.error(`held opinion ${id} not found`);
    process.exit(1);
  }
  const block = held.blocks[i];

  if (response === '对') {
    held.blocks.splice(i, 1);
    write('held.md', held.header + held.blocks.join(''));
    const c = blocksOf(read('confirmed.md'));
    write('confirmed.md', (c.header + c.blocks.join('') + block).replace(/_None yet\._\n?/, ''));
    console.log(`${id} -> confirmed.md`);
  } else if (response === '不对') {
    held.blocks.splice(i, 1);
    write('held.md', held.header + held.blocks.join(''));
    const r = blocksOf(read('rejected.md'));
    const withReason = block.trimEnd() + `\n- Rejected reason: ${reason ?? '(none)'}\n\n`;
    write('rejected.md', (r.header + r.blocks.join('') + withReason).replace(/_None yet\._\n?/, ''));
    console.log(`${id} -> rejected.md (never re-proposed)`);
  } else if (response === '有可能') {
    const updated = block.replace(
      /Confidence:\s*([0-9.]+)/,
      (_, c) => `Confidence: ${Math.min(1, parseFloat(c) + 0.1).toFixed(2)}`
    ).replace(
      /Last engaged:\s*(.+)/,
      `Last engaged: ${new Date().toISOString().slice(0, 10)}`
    );
    held.blocks[i] = updated;
    write('held.md', held.header + held.blocks.join(''));
    console.log(`${id} stays held; confidence +0.1`);
  } else {
    console.error('unknown response (use 对 / 不对 / 有可能)');
    process.exit(1);
  }
}

(async () => {
  if (!URL) {
    console.error('SUPABASE_DB_URL not set (add to .env.local)');
    process.exit(1);
  }
  const cmd = process.argv[2];
  const client = new Client({ connectionString: URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    if (cmd === 'detect') await detect(client);
    else if (cmd === 'respond') respond(client);
    else {
      console.error('usage: opinions.mjs <detect|respond>');
      process.exit(1);
    }
  } finally {
    await client.end();
  }
})();

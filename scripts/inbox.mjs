#!/usr/bin/env node
// ES-012 §3 — draft docs/pm/inbox/YYYY-MM-DD.md from promoted feedback notes.
// The Feedback Inbox [promote] sets value.promoted=true on a note; this local
// command turns promoted notes into a PM-inbox draft the owner edits/commits.
//
//   node --env-file=.env.local scripts/inbox.mjs
//
// One-way (owner → dev). Never writes to TRACKING.md.

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const URL = process.env.SUPABASE_DB_URL;
if (!URL) {
  console.error('SUPABASE_DB_URL not set (add to .env.local)');
  process.exit(1);
}

const tz = process.env.YUANYING_TZ || 'America/New_York';
const dayKey = iso =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

const client = new pg.Client({ connectionString: URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query(
  "select id, created_at, value->>'text' as text, value->'tags' as tags " +
    "from signals where name='note' and value->>'promoted'='true' order by created_at asc"
);
await client.end();

if (rows.length === 0) {
  console.log('inbox: no promoted feedback notes.');
  process.exit(0);
}

const outDir = path.join(process.cwd(), 'docs', 'pm', 'inbox');
fs.mkdirSync(outDir, { recursive: true });

const byDay = new Map();
for (const r of rows) {
  const d = dayKey(r.created_at);
  if (!byDay.has(d)) byDay.set(d, []);
  byDay.get(d).push(r);
}

for (const [d, items] of byDay) {
  const body =
    `# PM Inbox — ${d}\n\n` +
    `Drafted from promoted notes (ES-012 §3). Owner edits and commits.\n\n` +
    items
      .map(r => {
        const tags = Array.isArray(r.tags) ? r.tags : [];
        return `- [note #${r.id}] ${r.text}${
          tags.length ? `  _(tags: ${tags.join(', ')})_` : ''
        }`;
      })
      .join('\n') +
    '\n';
  const out = path.join(outDir, `${d}.md`);
  fs.writeFileSync(out, body);
  console.log(`wrote ${path.relative(process.cwd(), out)} (${items.length})`);
}

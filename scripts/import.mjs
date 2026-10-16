#!/usr/bin/env node
// ES-010 §3 — folder import (local agent/dev command).
// Reads ~/yuanying/imports/conversations/*.md and materializes them under
// core/memory/conversations/ in the standard record format (ES-010 §5).
//
//   npm run import
//
// Files are MOVED out of the imports folder once ingested. No secrets here.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SRC = path.join(os.homedir(), 'yuanying', 'imports', 'conversations');
const DST = path.join(process.cwd(), 'core', 'memory', 'conversations');

fs.mkdirSync(SRC, { recursive: true });
fs.mkdirSync(DST, { recursive: true });

function slugify(s) {
  return (
    s
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'session'
  );
}

function normalize(date, slug, raw) {
  const title = raw.match(/^#\s+(.+)$/m)?.[1] ?? slug;
  const body = raw.replace(/^#\s+.+\n?/, '').trim();
  return `# Conversation Record — ${title}

**Span**: ${date}
**Participants**: Owner, AI (imported)
**Status**: Distilled. Raw transcript not retained.

This is a memory file. Read-only after save. Editing is false memory.

---

## Decisions

${body}

---
`;
}

const files = fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter(f => f.endsWith('.md'))
  : [];

let moved = 0;
for (const f of files) {
  const src = path.join(SRC, f);
  const raw = fs.readFileSync(src, 'utf-8');
  const base = f.replace(/\.md$/, '');
  const date =
    base.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ??
    new Date().toISOString().slice(0, 10);
  const slug = slugify(base.replace(/^\d{4}-\d{2}-\d{2}-?/, ''));
  const out = path.join(DST, `${date}-${slug}.md`);
  if (fs.existsSync(out)) {
    console.log(`skip (exists): ${path.basename(out)}`);
    continue;
  }
  const body = raw.includes('# Conversation Record')
    ? raw
    : normalize(date, slug, raw);
  fs.writeFileSync(out, body);
  fs.unlinkSync(src);
  moved += 1;
  console.log(`imported ${f} -> ${path.basename(out)}`);
}

console.log(`done. ${moved} file(s) imported into ${DST}`);

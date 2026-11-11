import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIKI_DIR = path.join(os.homedir(), 'yuanying', 'local_kb', 'wiki');

/** ES-080: read-only view of the local Obsidian vault (Markdown files). */
export async function GET() {
  const files: Array<{ name: string; path: string; size: number; updated_at: string }> = [];
  const walk = (dir: string, prefix = '') => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (/\.(md|txt)$/i.test(entry.name)) {
        const stat = fs.statSync(full);
        files.push({
          name: rel,
          path: full,
          size: stat.size,
          updated_at: stat.mtime.toISOString(),
        });
      }
    }
  };
  walk(WIKI_DIR);
  files.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return NextResponse.json({
    dir: WIKI_DIR,
    exists: fs.existsSync(WIKI_DIR),
    files: files.slice(0, 200),
  });
}

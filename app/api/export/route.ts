import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { supabase } from '@/lib/db';
import {
  SESSION_COOKIE,
  isBearerValid,
  verifySession,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE_SIZE = 1000;

const TABLES: Array<{ name: string; select: string }> = [
  { name: 'messages', select: '*' },
  { name: 'signals', select: '*' },
  { name: 'summaries', select: '*' },
  { name: 'reminders', select: '*' },
  { name: 'habits', select: '*' },
  { name: 'config', select: '*' },
  { name: 'fenshen', select: '*' },
  // Never export models.api_key.
  {
    name: 'models',
    select: 'id, provider, model_name, base_url, created_at',
  },
];

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.SESSION_SECRET || '';
  const token = process.env.API_TOKEN || '';

  const exp = await verifySession(
    req.cookies.get(SESSION_COOKIE)?.value,
    secret
  );
  return exp !== null || isBearerValid(req.headers.get('authorization'), token);
}

async function fetchAll(
  table: string,
  select: string
): Promise<{ rows: any[]; skipped: boolean }> {
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return { rows: [], skipped: true };
      }
      throw new Error(`${table}: ${error.message}`);
    }

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows, skipped: false };
}

function collectFiles(
  dir: string,
  base: string,
  out: Array<{ path: string; content: string }>
) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, base, out);
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
      out.push({
        path: path.relative(base, full),
        content: fs.readFileSync(full, 'utf-8'),
      });
    }
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const root = process.cwd();
  const tables: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  const skippedTables: string[] = [];

  try {
    for (const table of TABLES) {
      const { rows, skipped } = await fetchAll(table.name, table.select);
      if (skipped) {
        skippedTables.push(table.name);
        continue;
      }
      tables[table.name] = rows;
      counts[table.name] = rows.length;
    }
  } catch (e) {
    console.error('export query failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'export failed' },
      { status: 500 }
    );
  }

  const exportedAt = new Date().toISOString();
  const payload = {
    version: 1,
    exported_at: exportedAt,
    manifest: {
      counts,
      skipped_tables: skippedTables,
      excluded: ['models.api_key', 'google_oauth_tokens'],
    },
    tables,
  };

  const files: Array<{ path: string; content: string }> = [];
  collectFiles(path.join(root, 'core'), root, files);
  collectFiles(path.join(root, 'memory'), root, files);

  const zip = new JSZip();
  zip.file('yuanying-data-export.json', JSON.stringify(payload, null, 2));
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  zip.file(
    'README.txt',
    [
      'Yuanying data export',
      `Exported at: ${exportedAt}`,
      '',
      'Contents:',
      '- yuanying-data-export.json — all exported DB tables + manifest',
      '- core/** — identity, rules, habits, prompts, and conversation memory',
      '',
      'Secrets excluded:',
      '- models.api_key',
      '- google_oauth_tokens',
      '',
      'Restore outline:',
      '1. Create a Postgres database and import the weekly SQL snapshot from',
      '   backups/db/YYYY-MM-DD.sql (or rebuild from the JSON with a script).',
      '2. Restore core/ from this ZIP or from the Git repository.',
      '3. Point the app at the database (ES-034) and start it.',
    ].join('\n')
  );

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const date = exportedAt.slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="yuanying-export-${date}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}

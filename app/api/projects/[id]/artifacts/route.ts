import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ES-080: project artifacts = cloud docs + local wiki/<project>/ files. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  const { data } = await supabase
    .from('project_docs')
    .select('name, updated_at, content')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });
  const docs = (data ?? []).map((d: any) => ({
    name: d.name,
    source: 'cloud',
    chars: String(d.content ?? '').length,
    updated_at: d.updated_at,
  }));

  const wiki: Array<{ name: string; source: string; chars: number; updated_at: string }> = [];
  const dir = path.join(os.homedir(), 'yuanying', 'local_kb', 'wiki', projectId);
  const walk = (base: string, prefix = '') => {
    if (!fs.existsSync(base)) return;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const full = path.join(base, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (/\.(md|txt)$/i.test(entry.name)) {
        const stat = fs.statSync(full);
        wiki.push({
          name: rel,
          source: 'wiki',
          chars: stat.size,
          updated_at: stat.mtime.toISOString(),
        });
      }
    }
  };
  walk(dir);

  return NextResponse.json({ project_id: projectId, artifacts: [...docs, ...wiki] });
}

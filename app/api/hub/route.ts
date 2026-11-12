import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getTodayRange } from '@/lib/timezone';
import { localHub } from '@/lib/local-read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIKI_DIR = path.join(os.homedir(), 'yuanying', 'local_kb', 'wiki');

function listWiki(limit = 8) {
  const files: Array<{ name: string; size: number; updated_at: string }> = [];
  const walk = (dir: string, prefix = '') => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (/\.(md|txt)$/i.test(entry.name)) {
        const stat = fs.statSync(full);
        files.push({ name: rel, size: stat.size, updated_at: stat.mtime.toISOString() });
      }
    }
  };
  walk(WIKI_DIR);
  return files.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limit);
}

/** ES-080: one aggregate for the desktop hub (read-only). */
export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() || null;
  if (new URL(req.url).searchParams.get('local') === '1') {
    return NextResponse.json(localHub(projectId));
  }
  const tz = await getConfigTimezone();
  const { start, end } = getTodayRange(tz);

  const [stepsRes, waterRes, sleepRes, projectsRes, goalsRes, activityRes] =
    await Promise.all([
      supabase
        .from('signals')
        .select('value, context, created_at')
        .eq('name', 'steps')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('signals')
        .select('id', { count: 'exact', head: true })
        .eq('name', 'water')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString()),
      supabase
        .from('signals')
        .select('value, created_at')
        .eq('name', 'sleep')
        .gte('created_at', new Date(Date.now() - 3 * 86400000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('projects').select('id, name, description, status').order('created_at'),
      (() => {
        let q = supabase
          .from('goals')
          .select('id, project_id, title, status, due_date')
          .eq('status', 'open')
          .order('created_at');
        if (projectId) q = q.eq('project_id', projectId);
        return q;
      })(),
      (() => {
        let q = supabase
          .from('messages')
          .select('id, role, content, created_at, project_id')
          .order('id', { ascending: false })
          .limit(8);
        if (projectId) q = q.eq('project_id', projectId);
        return q;
      })(),
    ]);

  let docsQuery = supabase
    .from('project_docs')
    .select('project_id, name, updated_at, content')
    .order('updated_at', { ascending: false })
    .limit(8);
  if (projectId) docsQuery = docsQuery.eq('project_id', projectId);
  const docsRes = await docsQuery;
  // PostgREST does not allow length(content) in select; compute here and drop
  // the body from the hub payload.
  if (projectsRes.error || goalsRes.error || activityRes.error) {
    console.warn('hub: falling back to local SQLite');
    return NextResponse.json(localHub(projectId));
  }

  const docs = ((docsRes.data ?? []) as any[]).map(d => ({
    project_id: d.project_id,
    name: d.name,
    updated_at: d.updated_at,
    chars: String(d.content ?? '').length,
  }));

  const steps = stepsRes.data as any;
  const sleep = sleepRes.data as any;
  const projects = (projectsRes.data ?? []) as any[];
  const goals = (goalsRes.data ?? []) as any[];
  const activity = ((activityRes.data ?? []) as any[]).reverse();

  // Per-project last activity + open goal count (small N).
  const enriched = await Promise.all(
    projects.map(async p => {
      const [{ data: last }, { count }] = await Promise.all([
        supabase
          .from('messages')
          .select('content, created_at')
          .eq('project_id', p.id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('goals')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', p.id)
          .eq('status', 'open'),
      ]);
      return {
        ...p,
        last_message: last?.content ? String(last.content).slice(0, 120) : null,
        last_at: last?.created_at ?? null,
        open_goals: count ?? 0,
      };
    })
  );

  return NextResponse.json({
    timezone: tz,
    date: start.toISOString().slice(0, 10),
    steps: steps ? { value: steps.value, context: steps.context, at: steps.created_at } : null,
    water: waterRes.count ?? 0,
    water_goal: 6,
    sleep: sleep ? { value: sleep.value, at: sleep.created_at } : null,
    projects: enriched,
    goals,
    activity: activity.map(m => ({
      id: m.id,
      role: m.role,
      project_id: m.project_id,
      snippet: String(m.content ?? '').slice(0, 140),
      at: m.created_at,
    })),
    docs,
    wiki: listWiki(8),
    wiki_dir: WIKI_DIR,
  });
}

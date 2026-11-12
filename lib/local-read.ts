import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getLocalDb } from './local-db';
import { getTodayRange } from './timezone';

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Phase 2: local reads used when Supabase is unreachable. */

export function localConfig(): Record<string, unknown> {
  const rows = getLocalDb().prepare('select key, value from config').all() as Array<{
    key: string;
    value: string | null;
  }>;
  return Object.fromEntries(rows.map(r => [r.key, parseJson(r.value, null)]));
}

export function localHistory(opts: {
  limit?: number;
  projectId?: string | null;
  todayOnly?: boolean;
  timezone?: string;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  let sql =
    'select id, role, content, created_at, metadata, responder_fenshen_id from messages';
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.projectId) {
    where.push('project_id = ?');
    params.push(opts.projectId);
  }
  if (opts.todayOnly) {
    const tz = opts.timezone || 'America/Detroit';
    const { start, end } = getTodayRange(tz);
    where.push('created_at >= ? and created_at < ?');
    params.push(start.toISOString(), end.toISOString());
  }
  if (where.length) sql += ' where ' + where.join(' and ');
  sql += ' order by id desc limit ?';
  params.push(limit);
  const rows = getLocalDb().prepare(sql).all(...params) as any[];
  return rows.reverse().map(r => {
    const meta = parseJson<Record<string, any>>(r.metadata, {});
    return {
      id: Number(r.id),
      role: r.role,
      content: r.content,
      created_at: r.created_at,
      github_issue_url: meta.github_issue_url ?? null,
      github_issue_number: meta.github_issue_number ?? null,
      inbox_path: meta.inbox_path ?? null,
      responder_fenshen_id: r.responder_fenshen_id ?? null,
      truncated: meta.truncated === true,
      local: true,
    };
  });
}

export function localHub(projectId: string | null) {
  const db = getLocalDb();
  const tz = (localConfig().timezone as string) || 'America/Detroit';
  const { start, end } = getTodayRange(tz);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const steps = db
    .prepare(
      "select value, context, created_at from signals where name='steps' and created_at >= ? and created_at < ? order by id desc limit 1"
    )
    .get(startIso, endIso) as any;
  const water = db
    .prepare(
      "select count(*) n from signals where name='water' and created_at >= ? and created_at < ?"
    )
    .get(startIso, endIso) as any;
  const sleep = db
    .prepare(
      "select value, created_at from signals where name='sleep' order by id desc limit 1"
    )
    .get() as any;

  const projects = db
    .prepare('select id, name, description, status from projects order by created_at')
    .all() as any[];
  const goals = (
    projectId
      ? db.prepare("select id, project_id, title, status, due_date from goals where project_id=? and status='open' order by id").all(projectId)
      : db.prepare("select id, project_id, title, status, due_date from goals where status='open' order by id").all()
  ) as any[];
  const activity = (
    projectId
      ? db.prepare('select id, role, project_id, content, created_at from messages where project_id=? order by id desc limit 8').all(projectId)
      : db.prepare('select id, role, project_id, content, created_at from messages order by id desc limit 8').all()
  ) as any[];
  const docs = (
    projectId
      ? db.prepare('select project_id, name, length(content) chars, updated_at from project_docs where project_id=? order by updated_at desc limit 8').all(projectId)
      : db.prepare('select project_id, name, length(content) chars, updated_at from project_docs order by updated_at desc limit 8').all()
  ) as any[];

  const enriched = projects.map(p => {
    const last = db
      .prepare('select content, created_at from messages where project_id=? order by id desc limit 1')
      .get(p.id) as any;
    const open = db
      .prepare("select count(*) n from goals where project_id=? and status='open'")
      .get(p.id) as any;
    return {
      ...p,
      last_message: last?.content ? String(last.content).slice(0, 120) : null,
      last_at: last?.created_at ?? null,
      open_goals: open?.n ?? 0,
    };
  });

  const wikiDir = path.join(os.homedir(), 'yuanying', 'local_kb', 'wiki');
  const wiki: Array<{ name: string; size: number; updated_at: string }> = [];
  const walk = (dir: string, prefix = '') => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (/\.(md|txt)$/i.test(entry.name)) {
        const stat = fs.statSync(full);
        wiki.push({ name: rel, size: stat.size, updated_at: stat.mtime.toISOString() });
      }
    }
  };
  walk(wikiDir);
  wiki.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return {
    timezone: tz,
    date: startIso.slice(0, 10),
    steps: steps ? { value: steps.value, context: parseJson(steps.context, {}), at: steps.created_at } : null,
    water: water?.n ?? 0,
    water_goal: 6,
    sleep: sleep ? { value: sleep.value, at: sleep.created_at } : null,
    projects: enriched,
    goals,
    activity: activity.reverse().map(m => ({
      id: m.id,
      role: m.role,
      project_id: m.project_id,
      snippet: String(m.content ?? '').slice(0, 140),
      at: m.created_at,
    })),
    docs,
    wiki: wiki.slice(0, 8),
    wiki_dir: wikiDir,
    local: true,
  };
}

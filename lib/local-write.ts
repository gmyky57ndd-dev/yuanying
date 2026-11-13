import { getLocalDb } from './local-db';

function json(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/** Best-effort mirror writes; never throw into the request path. */
export function mirrorMessages(
  rows: Array<{
    id?: number | string | null;
    role: string;
    content: string;
    session_id?: string | null;
    device_id?: string | null;
    project_id?: string | null;
    responder_fenshen_id?: string | null;
    metadata?: unknown;
    created_at?: string | null;
  }>
): void {
  try {
    const db = getLocalDb();
    const stmt = db.prepare(
      `insert into messages
       (remote_id, role, content, session_id, device_id, project_id, responder_fenshen_id, metadata, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(remote_id) do update set content = excluded.content`
    );
    for (const r of rows) {
      stmt.run(
        r.id != null ? String(r.id) : null,
        r.role,
        r.content,
        r.session_id ?? null,
        r.device_id ?? null,
        r.project_id ?? null,
        r.responder_fenshen_id ?? null,
        json(r.metadata),
        r.created_at ?? new Date().toISOString()
      );
    }
  } catch (e) {
    console.warn('local mirror messages failed', e);
  }
}

export function mirrorSignal(row: {
  id?: number | string | null;
  name: string;
  value?: unknown;
  context?: unknown;
  source?: string | null;
  feedback_status?: string | null;
  resolved_at?: string | null;
  created_at?: string | null;
}): void {
  try {
    getLocalDb()
      .prepare(
        `insert into signals (remote_id, name, value, context, source, feedback_status, resolved_at, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(remote_id) do update set value = excluded.value, context = excluded.context`
      )
      .run(
        row.id != null ? String(row.id) : null,
        row.name,
        json(row.value),
        json(row.context),
        row.source ?? null,
        row.feedback_status ?? null,
        row.resolved_at ?? null,
        row.created_at ?? new Date().toISOString()
      );
  } catch (e) {
    console.warn('local mirror signal failed', e);
  }
}

export function mirrorConfig(key: string, value: unknown): void {
  try {
    getLocalDb()
      .prepare(
        `insert into config (key, value, updated_at) values (?, ?, ?)
         on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, json(value), new Date().toISOString());
  } catch (e) {
    console.warn('local mirror config failed', e);
  }
}

export function mirrorGoal(row: {
  id: number;
  project_id?: string | null;
  title: string;
  status: string;
  due_date?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}): void {
  try {
    getLocalDb()
      .prepare(
        `insert into goals (id, project_id, title, status, due_date, created_at, completed_at)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set title=excluded.title, status=excluded.status, due_date=excluded.due_date, completed_at=excluded.completed_at`
      )
      .run(
        row.id,
        row.project_id ?? null,
        row.title,
        row.status,
        row.due_date ?? null,
        row.created_at ?? null,
        row.completed_at ?? null
      );
  } catch (e) {
    console.warn('local mirror goal failed', e);
  }
}

export function mirrorApproval(row: {
  id: number;
  project_id: string;
  title: string;
  description?: string | null;
  adr?: string | null;
  status: string;
  created_by?: string | null;
  approved_by?: string | null;
  issue_number?: number | null;
  issue_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  approved_at?: string | null;
}): void {
  try {
    getLocalDb()
      .prepare(
        `insert into approvals (id, project_id, title, description, adr, status, created_by, approved_by, issue_number, issue_url, created_at, updated_at, approved_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set title=excluded.title, description=excluded.description, adr=excluded.adr, status=excluded.status, approved_by=excluded.approved_by, issue_number=excluded.issue_number, issue_url=excluded.issue_url, approved_at=excluded.approved_at, updated_at=excluded.updated_at`
      )
      .run(
        row.id,
        row.project_id,
        row.title,
        row.description ?? null,
        row.adr ?? null,
        row.status,
        row.created_by ?? null,
        row.approved_by ?? null,
        row.issue_number ?? null,
        row.issue_url ?? null,
        row.created_at ?? null,
        row.updated_at ?? null,
        row.approved_at ?? null
      );
  } catch (e) {
    console.warn('local mirror approval failed', e);
  }
}

export function mirrorAction(row: {
  id: number;
  project_id: string;
  description: string;
  status: string;
  result_ref?: string | null;
  github_issue_number?: number | null;
  github_issue_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}): void {
  try {
    getLocalDb()
      .prepare(
        `insert into workpad_actions (id, project_id, description, status, result_ref, github_issue_number, github_issue_url, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set description=excluded.description, status=excluded.status, result_ref=excluded.result_ref, github_issue_number=excluded.github_issue_number, github_issue_url=excluded.github_issue_url, updated_at=excluded.updated_at`
      )
      .run(
        row.id,
        row.project_id,
        row.description,
        row.status,
        row.result_ref ?? null,
        row.github_issue_number ?? null,
        row.github_issue_url ?? null,
        row.created_at ?? null,
        row.updated_at ?? null
      );
  } catch (e) {
    console.warn('local mirror action failed', e);
  }
}

export function mirrorDelete(
  table: 'goals' | 'approvals' | 'workpad_actions',
  id: number
): void {
  try {
    getLocalDb().prepare(`delete from ${table} where id = ?`).run(id);
  } catch (e) {
    console.warn(`local mirror delete ${table} failed`, e);
  }
}

export function mirrorProjectDoc(row: {
  project_id: string;
  name: string;
  content: string;
  updated_at?: string | null;
}): void {
  try {
    getLocalDb()
      .prepare(
        `insert into project_docs (project_id, name, content, updated_at) values (?, ?, ?, ?)
         on conflict(project_id, name) do update set content=excluded.content, updated_at=excluded.updated_at`
      )
      .run(row.project_id, row.name, row.content, row.updated_at ?? new Date().toISOString());
  } catch (e) {
    console.warn('local mirror project doc failed', e);
  }
}

export function mirrorProjectMembers(
  projectId: string,
  ids: string[],
  lead: string
): void {
  try {
    const db = getLocalDb();
    db.exec('BEGIN');
    db.prepare('delete from project_fenshen_map where project_id = ?').run(projectId);
    const stmt = db.prepare(
      'insert into project_fenshen_map (project_id, fenshen_id, is_lead) values (?, ?, ?)'
    );
    for (const id of ids) stmt.run(projectId, id, id === lead ? 1 : 0);
    db.exec('COMMIT');
  } catch (e) {
    console.warn('local mirror project members failed', e);
  }
}

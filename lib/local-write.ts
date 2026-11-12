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

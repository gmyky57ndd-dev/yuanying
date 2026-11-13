import { supabase } from './db';
import { getLocalDb } from './local-db';

function getCursor(db: ReturnType<typeof getLocalDb>, entity: string): string | null {
  const row = db.prepare('select cursor from sync_state where entity = ?').get(entity) as
    | { cursor: string | null }
    | undefined;
  return row?.cursor ?? null;
}

function setCursor(
  db: ReturnType<typeof getLocalDb>,
  entity: string,
  cursor: string | null
): void {
  if (!cursor) return;
  db.prepare(
    'insert into sync_state (entity, cursor) values (?, ?) on conflict(entity) do update set cursor = excluded.cursor'
  ).run(entity, cursor);
}

const bump = (a: string | null, b: string | null) =>
  b && (!a || b > a) ? b : a;

/** Phase 2: pull cloud rows into SQLite (phone/other-device writes). */
export async function pullAll(): Promise<{
  messages: number;
  signals: number;
  config: number;
  tables: number;
  errors: string[];
}> {
  const db = getLocalDb();
  const errors: string[] = [];
  let messages = 0;
  let signals = 0;
  let config = 0;
  let tables = 0;

  // messages: incremental by created_at, 500 per run.
  try {
    const since =
      getCursor(db, 'messages') || new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('messages')
      .select(
        'id, role, content, session_id, device_id, project_id, responder_fenshen_id, metadata, created_at'
      )
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    const stmt = db.prepare(
      `insert into messages (remote_id, role, content, session_id, device_id, project_id, responder_fenshen_id, metadata, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(remote_id) do update set content = excluded.content, metadata = excluded.metadata, responder_fenshen_id = excluded.responder_fenshen_id`
    );
    let last: string | null = null;
    for (const r of data ?? []) {
      stmt.run(
        String(r.id),
        r.role,
        r.content,
        r.session_id,
        r.device_id,
        r.project_id,
        r.responder_fenshen_id,
        r.metadata ? JSON.stringify(r.metadata) : null,
        r.created_at
      );
      last = bump(last, r.created_at);
      messages += 1;
    }
    setCursor(db, 'messages', last);
  } catch (e) {
    errors.push(`messages: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // signals: incremental by created_at, 3-day default window.
  try {
    const since =
      getCursor(db, 'signals') || new Date(Date.now() - 3 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('signals')
      .select('id, name, value, context, source, feedback_status, resolved_at, created_at')
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    const stmt = db.prepare(
      `insert into signals (remote_id, name, value, context, source, feedback_status, resolved_at, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(remote_id) do update set value = excluded.value, context = excluded.context, feedback_status = excluded.feedback_status, resolved_at = excluded.resolved_at`
    );
    let last: string | null = null;
    for (const r of data ?? []) {
      stmt.run(
        String(r.id),
        r.name,
        r.value == null ? null : JSON.stringify(r.value),
        r.context == null ? null : JSON.stringify(r.context),
        r.source,
        r.feedback_status,
        r.resolved_at,
        r.created_at
      );
      last = bump(last, r.created_at);
      signals += 1;
    }
    setCursor(db, 'signals', last);
  } catch (e) {
    errors.push(`signals: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // config: full upsert, but never overwrite a key that is still in outbox.
  try {
    const pending = new Set(
      (db.prepare("select payload from outbox where entity='config'").all() as Array<{
        payload: string;
      }>).map(r => {
        try {
          return String(JSON.parse(r.payload).key);
        } catch {
          return '';
        }
      })
    );
    const { data, error } = await supabase.from('config').select('key, value, updated_at');
    if (error) throw new Error(error.message);
    const stmt = db.prepare(
      `insert into config (key, value, updated_at) values (?, ?, ?)
       on conflict(key) do update set value=excluded.value, updated_at=excluded.updated_at`
    );
    for (const r of data ?? []) {
      if (pending.has(r.key)) continue;
      stmt.run(r.key, r.value == null ? null : JSON.stringify(r.value), r.updated_at);
      config += 1;
    }
  } catch (e) {
    errors.push(`config: ${e instanceof Error ? e.message : 'failed'}`);
  }

  // small tables: full upsert each run.
  const full: Array<[string, string, (r: any) => unknown[]]> = [
    [
      'projects',
      'id, name, description, status, created_at',
      r => [r.id, r.name, r.description, r.status, r.created_at],
    ],
    [
      'project_docs',
      'project_id, name, content, updated_at',
      r => [r.project_id, r.name, r.content, r.updated_at],
    ],
    [
      'goals',
      'id, project_id, title, status, due_date, created_at, completed_at',
      r => [r.id, r.project_id, r.title, r.status, r.due_date, r.created_at, r.completed_at],
    ],
    [
      'workpad_actions',
      'id, project_id, description, status, result_ref, github_issue_number, github_issue_url, created_at, updated_at',
      r => [r.id, r.project_id, r.description, r.status, r.result_ref, r.github_issue_number, r.github_issue_url, r.created_at, r.updated_at],
    ],
    [
      'approvals',
      'id, project_id, title, description, adr, status, created_by, approved_by, issue_url, created_at, updated_at, approved_at',
      r => [
        r.id,
        r.project_id,
        r.title,
        r.description,
        r.adr,
        r.status,
        r.created_by,
        r.approved_by,
        r.issue_url,
        r.created_at,
        r.updated_at,
        r.approved_at,
      ],
    ],
    [
      'fenshen',
      'id, display_name, prompt_md, avatar_url, kind, tools_whitelist, model_name, has_all_tools, enabled',
      r => [
        r.id,
        r.display_name,
        r.prompt_md,
        r.avatar_url,
        r.kind,
        r.tools_whitelist == null ? null : JSON.stringify(r.tools_whitelist),
        r.model_name,
        r.has_all_tools ? 1 : 0,
        r.enabled ? 1 : 0,
      ],
    ],
  ];

  const sqlFor = (table: string, cols: string) => {
    const list = cols.split(',').map(c => c.trim());
    const placeholders = list.map(() => '?').join(', ');
    const updates = list
      .filter(c => c !== 'id' && c !== 'project_id' && c !== 'name')
      .map(c => `${c}=excluded.${c}`)
      .join(', ');
    const conflict =
      table === 'project_docs'
        ? '(project_id, name)'
        : table === 'fenshen'
          ? '(id)'
          : '(id)';
    return `insert into ${table} (${list.join(', ')}) values (${placeholders})
      on conflict ${conflict} do update set ${updates || `${list[0]}=excluded.${list[0]}`}`;
  };

  for (const [table, cols, map] of full) {
    try {
      const { data, error } = await supabase.from(table).select(cols);
      if (error) throw new Error(error.message);
      const stmt = db.prepare(sqlFor(table, cols));
      for (const r of data ?? []) stmt.run(...map(r));
      tables += data?.length ?? 0;
    } catch (e) {
      errors.push(`${table}: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }

  try {
    const { data, error } = await supabase
      .from('project_fenshen_map')
      .select('project_id, fenshen_id, is_lead');
    if (error) throw new Error(error.message);
    db.exec('BEGIN');
    db.exec('delete from project_fenshen_map');
    const stmt = db.prepare(
      'insert into project_fenshen_map (project_id, fenshen_id, is_lead) values (?, ?, ?)'
    );
    for (const r of data ?? []) stmt.run(r.project_id, r.fenshen_id, r.is_lead ? 1 : 0);
    db.exec('COMMIT');
    tables += data?.length ?? 0;
  } catch (e) {
    db.exec('ROLLBACK');
    errors.push(`project_fenshen_map: ${e instanceof Error ? e.message : 'failed'}`);
  }

  return { messages, signals, config, tables, errors };
}

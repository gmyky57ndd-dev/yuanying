import { supabase } from './db';
import { getLocalDb } from './local-db';

export type OutboxEntity = 'signal' | 'config';

export function enqueueOutbox(
  entity: OutboxEntity,
  op: 'insert' | 'upsert',
  payload: Record<string, unknown>
): void {
  try {
    getLocalDb()
      .prepare(
        'insert into outbox (entity, op, payload, created_at) values (?, ?, ?, ?)'
      )
      .run(entity, op, JSON.stringify(payload), new Date().toISOString());
  } catch (e) {
    console.warn('outbox enqueue failed', e);
  }
}

export async function flushOutbox(): Promise<{
  processed: number;
  failed: number;
  pending: number;
}> {
  const db = getLocalDb();
  const rows = db
    .prepare('select id, entity, op, payload, attempts from outbox order by id limit 50')
    .all() as Array<{
    id: number;
    entity: string;
    op: string;
    payload: string;
    attempts: number;
  }>;
  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      db.prepare('delete from outbox where id=?').run(row.id);
      continue;
    }
    let error: string | null = null;
    try {
      if (row.entity === 'config') {
        const { error: e } = await supabase
          .from('config')
          .upsert(
            { key: String(payload.key), value: payload.value, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          );
        error = e?.message ?? null;
      } else if (row.entity === 'signal') {
        const { error: e } = await supabase.from('signals').insert({
          name: String(payload.name),
          type: payload.type ?? null,
          value: payload.value ?? null,
          source: payload.source ?? null,
          context: payload.context ?? null,
        });
        error = e?.message ?? null;
      } else {
        error = `unknown outbox entity: ${row.entity}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'network error';
    }

    if (!error) {
      db.prepare('delete from outbox where id=?').run(row.id);
      processed += 1;
    } else {
      failed += 1;
      db.prepare(
        'update outbox set attempts = attempts + 1, last_error = ? where id = ?'
      ).run(error.slice(0, 300), row.id);
    }
  }

  const pending = (db.prepare('select count(*) n from outbox').get() as { n: number }).n;
  return { processed, failed, pending };
}

# Phase 2 — SQLite Local-First (step 1)

- **Date:** 2026-11-12
- **Status:** foundation landed; reads/offline fallback still pending.
- **Approved:** SQLite data layer, desktop first.

## What is local now

`~/yuanying/yuanying.db` (SQLite, WAL):
- `messages`, `signals`, `config`
- `projects`, `project_docs`, `goals`, `workpad_actions`, `approvals`
- `fenshen`, `project_fenshen_map`

Schema is in `lib/local-db.ts`; **`node:sqlite`** (built into Node 22/26) is used,
so there is no native dependency to package into Tauri.

## Backfill

`node --env-file=.env.local scripts/sqlite-backfill.mjs`

First run (2026-11-12):

```
config 20 · messages 1156 · signals 3059 · projects 3 · project_docs 3
goals 0 · workpad_actions 19 · approvals 1 · fenshen 5 · project_fenshen_map 7
db 2.2 MB
```

## Dual-write (best-effort, cloud remains source of truth)

- `/api/note` → `signals`
- `/api/steps` → `signals`
- `/api/config` PUT → `config`
- `/api/chat` final insert → `messages` (with responder/truncated metadata)

Verified: note/steps/config/chat writes appeared in SQLite; counts moved
1156→1158 messages, 3059→3060 signals, 20→21 config.

## Local reads / fallback (step 2)

- `/api/history`, `/api/config`, `/api/hub` fall back to SQLite when Supabase
  returns an error; each also supports `?local=1` for an explicit local read.
- `local-read.ts` serves messages/config/hub (projects, goals, activity, docs,
  wiki, steps/water/sleep) from SQLite.
- Verified: `history?local=1` → 2 rows; `config?local=1` → 22 keys;
  `hub?local=1&project_id=bwp` → 3 projects / 8 activity / 2 docs.

## Remaining writes mirrored

- `goals` POST/PATCH/DELETE, `approvals` POST/PATCH, project docs POST,
  project member PUT (replace), chat `plan_actions`/`complete_action`/
  `propose_work`/`submit_adr`.
- Verified new goal/approval rows appear in SQLite.

## Outbox / sync worker

- `outbox` table in SQLite for offline writes; `/api/note`, `/api/config`,
  `/api/steps` queue on Supabase failure and still return `queued: true`.
- `/api/sync/flush` (CRON_SECRET) + `scripts/sync-outbox.sh`; launchd
  `com.yuanying.sync` every 60s.
- Verified: inserted a config outbox row → `processed 1`, cloud value `synced`,
  pending 0; launchd run exit 0.

## Pull sync (phone → desktop)

- `lib/sync-pull.ts` pulls messages/signals incrementally (cursor in
  `sync_state`), config fully (skips keys still in outbox), and small tables
  (projects/docs/goals/actions/approvals/fenshen/maps) every run.
- `/api/sync/pull` (CRON_SECRET); `sync-outbox.sh` does flush → pull.
- Verified: phone message inserted in Supabase → pull returned 1 → appeared in
  SQLite; cursors advanced. Second pull idempotent.

## Not yet

- Full conflict resolution: config uses "outbox wins until flushed"; other
  tables are cloud-wins (LWW by cloud updated_at).
- Full repository abstraction (routes still call Supabase first).
- Tauri app uses the same DB path and starts with `node:sqlite` (274 MB app).

## Next

1. Repository layer with local reads + Supabase fallback (`/api/history`,
   `/api/config`, `/api/hub`).
2. Mirror the remaining write paths.
3. Offline queue + reconnect sync; then make local the primary store.

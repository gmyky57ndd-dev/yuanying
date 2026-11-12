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

## Not yet

- Reads still use Supabase; no offline fallback.
- `goals` / `workpad_actions` / `approvals` writes are not mirrored yet.
- No sync worker / conflict resolution; Supabase remains authoritative.
- Tauri app uses the same DB path and starts with `node:sqlite` (273 MB app).

## Next

1. Repository layer with local reads + Supabase fallback (`/api/history`,
   `/api/config`, `/api/hub`).
2. Mirror the remaining write paths.
3. Offline queue + reconnect sync; then make local the primary store.

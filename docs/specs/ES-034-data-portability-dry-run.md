# ES-034 — Data Portability Migration Test (The Dry Run)

**Status**: Approved
**Category**: Chore (Infrastructure Verification)
**Tracking**: P2-15

> **Tracking note**: the handoff requested **P2-10**, but P2-10 is the completed
> Phase C visual-polish item. This work is recorded as **P2-15** in
> `TRACKING.md`.

## 1. The Goal

Prove that Yuanying can survive a Supabase outage by successfully migrating the
database to a local Docker container or an alternative Postgres provider
(Neon).

## 2. The Test Steps

1. **Export**: Get the latest SQL dump from GitHub Actions
   (`backups/db/YYYY-MM-DD.sql`).
2. **Spin up new DB**:
   ```bash
   docker run -d --name yuanying-pg -p 5432:5432 \
     -e POSTGRES_PASSWORD=password postgres:15
   ```
   or create a free Neon Postgres database.
3. **Import**:
   ```bash
   psql -h localhost -U postgres -d postgres -f YYYY-MM-DD.sql
   ```
4. **Reconfigure**: Change the app env:
   ```env
   # Remove NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
   DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres
   ```
5. **Code adjust**: Ensure the DB client (`lib/db.ts`) supports standard
   Postgres connection strings (`pg` or `postgres.js`), not only the Supabase
   SDK. If it currently uses `@supabase/supabase-js`, introduce a lightweight
   Data Access Layer (DAL) wrapper so switching drivers is easy.
   - Required files: `lib/db.ts`, a new `lib/dal.ts` (or equivalent), and all
     callers that assume the Supabase query builder.
   - The DAL must expose the operations used by the app: select with
     equality/range/order/limit, insert, upsert, update, delete, and JSON-path
     filters.
   - Fallback: if `DATABASE_URL` is set, use `pg`; otherwise use Supabase.
6. **Run**: Start the app, read notes, send chat. Verify everything works
   without Supabase.

## 3. Acceptance

- [ ] The SQL dump successfully imports into standard Postgres.
- [ ] A local instance of Yuanying runs and reads/writes to this standard
      Postgres.
- [ ] The migration process takes less than 1 hour.
- [ ] No Supabase-specific API is required at runtime when `DATABASE_URL` is
      set.

## 4. Notes

- This is a verification chore, not a production switch. Keep Supabase as the
  default until the dry run passes.
- The weekly `db-backup.yml` dump is the input; do not hand-craft the schema.
- Store the discovered steps and timings in `TRACKING.md`.

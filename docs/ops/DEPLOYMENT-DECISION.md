# Deployment Decision — Desktop-first, Coolify deferred

**Status:** Agreed (owner + architect), 2026-11-13. Re-confirmed by owner on 2026-11-13.
**Scope:** fenshen / Workpad / desktop release. Not a phone PWA decision.

## Decision

1. **Desktop is local-first.** The product runs as a Tauri app with a bundled
   Next standalone server on `127.0.0.1:3100`. Desktop "release" means:
   `npm run tauri:build` → ad-hoc codesign → smoke test (`/api/health`, `/desktop`).
   There is no server to deploy for desktop.
2. **GitHub is the code/CI/review layer.** Branches, PRs, CI, Issues, approvals.
   It is not a desktop runtime.
3. **Supabase is the cloud data/sync layer.** Not a deployment target.
4. **Coolify is deferred to the phone/cloud phase.** It was proposed in ES-074
   for hosting the phone PWA / bridge when leaving Vercel. It is **not required
   for fenshen**, Workpad, approvals, or the desktop app.
5. **Do not reintroduce Coolify as a dependency** for fenshen/desktop work.
   Revisit only when the phone PWA needs a public backend and the owner chooses
   between Vercel and Coolify.
6. **Production deploy gate is provider-agnostic.** The red Owner-confirmation
   modal is generic; a provider webhook is optional. Coolify can be one adapter.
7. **`update_env_vars` for desktop** targets the local macOS Keychain /
   `~/Library/Application Support/com.yuanying.desktop/secrets.env`, not Coolify.

## Why this was documented again

A previous "Coolify deferred" decision was lost when the v0.02 sandbox design
listed `deploy_to_coolify` as if it were a required tool. This record is the
canonical decision; link to it instead of re-litigating.

## What is actually required

| Need | Mechanism |
|---|---|
| Desktop app release | local build + ad-hoc sign + smoke |
| Code/PR/CI | GitHub |
| Data/sync | Supabase |
| Local secrets | Keychain / 0600 Application Support file |
| Phone public backend | **deferred** — Vercel or Coolify, owner decision later |

## References

- `docs/specs/ES-074-coolify-migration.md` (proposal, now Deferred)
- `docs/specs/SANDBOX-SECURITY-v0.02.md` (generic deploy gate)
- `docs/planning/TAURI-PROGRAM-PLAN.md` (desktop-first, bridge for phone)

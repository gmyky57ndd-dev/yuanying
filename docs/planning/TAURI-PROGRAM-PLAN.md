# Tauri + Local-First Program Plan

- **Date:** 2026-11-12
- **Sources:** `docs/MASTER-BLUEPRINT-v3.md` (Desktop First / Local-First /
  UI Configurable; Client Layer = **Tauri (Mac/PC) + PWA (Mobile)**), all open
  GitHub issues/PRs as of 2026-11-12, current `/desktop` implementation.
- **Status:** proposal for owner approval.

## 1. GitHub inventory (2026-11-12)

Open issues fall into six clusters; several are duplicated by two AI-generated
plans (P0/P1 sets):

| Cluster | Issues | State |
| --- | --- | --- |
| Program / scope | #109 | scope + workflow |
| Playbook config | #101 (P0-1), #110 (P1-1 dup) | not built as a table; `fenshen` already has prompt/tools/model |
| Tool whitelist | #102 (P0-2), #111 (P1-2 dup) | conflicts with ES-082 `has_all_tools=true` |
| Desktop Hub | #104 (P1-4), #113 (P1-4 dup) | `/desktop` MVP already shipped (#92/#93/#98) |
| Local KB | #105 (Librarian), #106 (FTS5) | not implemented / not verified |
| Approval flow | #107 (P2-7), #114 (P1-7 dup) | not implemented |
| Collector | #116 (implementation), #103/#112 (dups), #118/#119 (device verification) | v1.0.47 built; PR #117 open |
| Reliability | #99 (fixed by #100/PR #120), #88 (evening 500), #97 (agent close/comment) | #99 stale |
| Future | #82 (images), #72 (Live2D) | not this cycle |

Open PRs: **#117** (collector #116/#118), **#120** (Failed to fetch ES-084).

## 2. Duplicate consolidation

| Keep | Close as duplicate / superseded |
| --- | --- |
| #116 (implemented + device verification) | #103, #112 |
| #101 (Playbook) | #110 |
| #102 (whitelist) | #111 |
| #104 (Desktop Hub) | #113 |
| #107 (approval) | #114 |
| #119 (real-device tracker) | #118 |
| #100 (closed fix) | #99 |

`#105/#106` and `#97/#88` are unique; `#82/#72` stay in the future bucket.

## 3. Tauri architecture (decision)

The blueprint only names Tauri as the client layer; it does not prescribe
packaging. Two viable paths:

**A. Tauri shell + Next.js sidecar (recommended first)**
- Tauri window → `http://127.0.0.1:3000`
- `next build` with `output: 'standalone'`; Node sidecar starts/stops with the app
- Fixed port + health check + crash restart + logs
- Keeps the whole UI/API codebase; removes browser→Funnel hop

**B. Tauri + local data layer (true local-first, Phase 2)**
- SQLite (or embedded Postgres) for `messages/signals/config/goals/actions`
- Repository layer: local first, Supabase for phone sync/backup
- Offline write queue + conflict rules (LWW + event log)
- Required for “断网还能用”; A alone only removes the tunnel hop

**C. Rust API rewrite** — not now; high cost, no user-visible benefit over A/B.

Critical honesty: Tauri does **not** remove Supabase/DeepSeek network calls.
Desktop→local server becomes reliable; cloud calls can still fail. Mobile still
needs the bridge (Tailscale/LAN/Coolify) — Tauri is desktop-only.

## 4. Phased roadmap

### Phase 0 — Tauri shell spike (2–3 days)
- `output: 'standalone'` build; sidecar lifecycle (start/stop/port/health)
- Tauri v2 window, single instance, logs, basic menu
- Acceptance: cold start < 3s; close stops sidecar; port conflict handled;
  app bundle runs without Funnel.

### Phase 1 — Desktop product surface (1–1.5 weeks)
- #104 Desktop Hub: project/fenshen switcher + Playbook preview (existing
  `/desktop` + `/desktop/workpad/[id]`; wire into Tauri).
- #101 Playbook: **reuse `fenshen`** (prompt/tools/model already there); add
  `enabled`/versioning only; do not create a duplicate table.
- #102 whitelist: resolve conflict with ES-082 — strict isolation is per
  fenshen `has_all_tools=false`, not a global default.
- #107 approval: proposed → ADR → approved → implementing → done; blocks
  `push_to_dev`.
- Acceptance: configure a fenshen in the app, restart Tauri, change persists;
  unapproved DSH cannot create an issue.

### Phase 2 — Local-first data (2–3 weeks)
- #106 FTS5 index: verify schema, rebuild from `raw/`, Chinese tokenizer.
- #105 Librarian + `local_rag_search` / `read_obsidian_vault` (path-safe).
- New: SQLite repository + migration from Supabase; offline queue; sync worker.
- Acceptance: pull network cable → chat history/config/goals readable; writes
  queue; reconnect syncs without duplicates.

### Phase 3 — Mobile & reliability (1 week, parallel)
- #116/#118/#119 collector (v1.0.47; PR #117).
- #120 Failed to fetch (keep for PWA; Tauri desktop no longer needs it).
- #88 evening summary 500; #97 close/comment/assign tools.
- Bridge/Tailscale remains for phone; Coolify (#74) is complementary, not
  replaced by Tauri.

### Phase 4 — Future
- #82 image input; #72 Live2D/voice.

## 5. Dependencies & estimates

```
Tauri shell ──► Desktop Hub/Playbook ──► Approval
     │                  │
     └──► Local data (SQLite) ──► Librarian/FTS5 ──► offline sync
Collector (mobile) ── parallel
```

| Item | Estimate |
| --- | --- |
| Tauri shell | 2–3 d |
| Desktop hub/playbook/approval | 6–8 d |
| Local data + sync | 10–15 d |
| Librarian + FTS5 | 3–5 d |
| Mobile collector + reliability | 3–5 d |
| **Total** | **4–6 weeks** (one dev + AI) |

## 6. Decisions needed

1. Approve Tauri as the next milestone (Phase 0 spike first)?
2. Data layer: SQLite (recommended) vs local Postgres?
3. Strict whitelist: keep ES-082 all-tools default, or flip selected
   professional fenshen to `has_all_tools=false`?
4. Signing: Apple Developer notarization now, or unsigned local `.app` first?
5. Coolify (#74): keep as mobile/cloud fallback, or defer?

## 7. Immediate next actions

1. Close the duplicate issues in §2 with canonical links.
2. Merge/review PR #117 (collector) and PR #120 (Failed to fetch).
3. Owner approves Phase 0; start the Tauri spike on a branch with no data-layer
   changes.
4. Keep desktop monitoring on `http://localhost:3000/desktop` (not Funnel).

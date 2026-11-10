# Desktop Hub v3 — Gap Analysis & Execution Plan

- **Source:** `MASTER-BLUEPRINT-v3.md` (2026-11-10) + attached mockup.
- **Scope:** **desktop only**. The mobile chat UI is frozen until the desktop is clean.
- **Status:** analysis for review; no implementation started (ES intake paused).

## 1. What the blueprint asks for

1. **Desktop shell**: top bar (global search, 首页 / Workpad / 设置, avatar), left
   sidebar (Spaces & Fenshen, Workpads, My Library), main hub, right inspector
   (health, recent activity, goals, artifacts).
2. **Library + Obsidian**: `raw/` (append-only), `wiki/` (Obsidian notes),
   `index.db` (rebuildable); open the local vault from the UI; a **Librarian**
   fenshen for retrieval.
3. **Configuration-driven object model**: Project templates (`project_md`,
   `allowed_fenshen_ids`), Fenshen playbooks (`system_prompt`, `model_provider`,
   `tools_whitelist`) editable from the UI.
4. **Hub content**: greeting + health metrics, active workpads, insights, recent
   activity, goals, artifacts.
5. **Agent protocol**: PM → Architect ADR → owner approval → DSH; tool isolation.

## 2. Current state (verified 2026-11-10)

| Area | State |
| --- | --- |
| Pages | `/` chat, `/settings`, `/history`, `/feedback`, `/import` — no hub, no desktop shell |
| Desktop layout | `page.tsx` has a 280px `md:` aside + chat; no top bar / inspector / library |
| Projects | `projects(id,name,description,status)`; `project_id` on messages/signals; selector in chat |
| Project docs | `project_docs` (BWP_PRD_V3 seeded); `read_project_doc`; no management UI |
| Fenshen | `fenshen(prompt_md, tools_whitelist, kind, avatar)`; chat selector; no editor, no per-fenshen model |
| Library | local KB (`raw/`, `docs/`, SQLite FTS5, bge-m3) + `search_local_kb`; **no `wiki/`, no Obsidian open, no Librarian** |
| Tracking data | `signals`: steps 1068 rows, water 85, sleep 17, standup 168; APIs `/api/steps`, `/api/note`, `/api/digest` — **unchanged** |
| Activity | `messages` + `/api/history`; no aggregated feed |
| Goals | **missing** (no table, no UI) |
| Artifacts | `project_docs` only; no unified artifact index / preview |
| Global search | **missing** (project docs + messages + local KB not searchable from one box) |
| Model routing | global `config.active_model_id`; no per-fenshen `model_provider` |

## 3. Gap matrix (desktop)

| Blueprint item | Gap | Effort |
| --- | --- | --- |
| 3-column shell + top bar | build new `/desktop` layout, nav, inspector slots | 2–3 d |
| Hub: greeting, health rail | data exists; need aggregation + UI | 2 d |
| Active Workpads cards | project list + latest message/artifact + roles | 1–2 d |
| Insights | computed heuristics (time split, note sentiment) | 2–3 d |
| Recent activity | aggregate messages/reminders/artifacts | 1 d |
| Goals | new `goals` table + CRUD + hub widget | 2 d |
| Artifacts | index project_docs + local files; preview | 2–3 d |
| Global search | search project_docs + messages + local KB | 2–3 d |
| Project config (`project_md`, `allowed_fenshen_ids`) | columns + settings UI | 2 d |
| Fenshen playbook editor (prompt, tools, model) | UI + validation + `model_provider` column | 3 d |
| Library: `wiki/`, Obsidian open, Librarian | directory, `obsidian://` open, seed fenshen, tools | 2–3 d |
| PM→Architect→owner approval flow | issue labels + approval UI | 2–3 d |
| Design tokens / polish | water-ink theme, spacing, empty states | 2 d |

**Total: ~24–30 dev-days** for the full blueprint.  
**MVP (recommended first release): ~8–10 dev-days** — shell + hub with real
tracking data + project/fenshen configuration + workpad cards; no Obsidian,
goals, insights, or global search.

## 4. Execution plan

### Phase 0 — Shell & tokens (2–3 d)
- New route `/desktop` (mobile `/` untouched; later promote to `/` on wide screens
  behind a flag).
- Top bar, left nav, main slot, right inspector; design tokens for the misty
  water-ink palette.
- **Acceptance:** `/desktop` renders with real projects/fenshen; mobile `/`
  byte-identical behaviour.

### Phase 1 — Hub with real data (3–4 d)
- Aggregation API: `GET /api/hub?project_id=` → greeting, health (steps/water/
  sleep), active workpads, recent activity (messages/reminders), artifacts
  (project_docs + local file list).
- Hub UI: greeting banner, health rail, workpad cards, recent activity,
  artifacts.
- **Acceptance:** numbers equal `/api/steps` / `/api/note`; no new write paths;
  mobile data flow unchanged.

### Phase 2 — Configuration (3–4 d)
- `projects.project_md`, `projects.allowed_fenshen_ids`.
- `fenshen.model_provider` (nullable → global router).
- Settings UI: project editor, fenshen playbook editor (prompt, tools, model),
  live tool-whitelist validation against `ALL_TOOL_NAMES`.
- **Acceptance:** edit a fenshen in the UI → `/api/chat` uses it without deploy;
  invalid tool names are rejected.

### Phase 3 — Workpad view (2–3 d)
- Workpad page: project-scoped chat + artifacts + members (fenshen), @-mention
  routing (PM/Architect/DSH), approval button for ADR.
- **Acceptance:** switching workpad isolates history; @fenshen selects the
  request fenshen; approval creates an Issue via `push_to_dev`.

### Phase 4 — Library & Obsidian (2–3 d)
- `wiki/` directory; "Open in Obsidian" (`obsidian://open?vault=...`), Librarian
  fenshen with `search_local_kb` + `read_local_file`.
- **Acceptance:** open vault from desktop; Librarian answers from local KB.

### Phase 5 — Goals, insights, global search (3–4 d)
- `goals` table + widget; computed insights; `/api/search` over project_docs +
  messages + local KB.
- **Acceptance:** each widget has a real source; no mock data.

## 5. Decisions needed before Phase 0

1. **Route**: `/desktop` first (recommended) or replace `/` on ≥1280px?
2. **Goals**: add table + manual UI, or derive from notes for MVP?
3. **Artifacts**: project_docs only, or also index local files (needs a safe
   relative-path scan)?
4. **Obsidian vault path**: `~/yuanying/local_kb/wiki` (blueprint) — confirm.
5. **Fenshen model**: allow per-fenshen `model_provider` in the UI, or keep the
   global router for now?
6. **Desktop client**: PWA in a browser first, or Tauri wrapper now?

## 6. MVP progress (2026-11-10)

Owner decisions: `/desktop` route; simple manual goals; read-only `wiki/`;
global model routing; PWA only.

Implemented in `feat/desktop-hub-mvp`:

- `/desktop` three-column shell (top bar with tabs, project/fenshen/wiki
  sidebar, hub main, health/activity/artifacts inspector).
- `GET /api/hub`: steps/water/sleep, projects (+open goals/last message),
  goals, activity, project docs, wiki files.
- `goals` table + `/api/goals` (list/create/check/delete) + hub checkboxes.
- `GET/PUT /api/fenshen/config`: edit prompt + tool whitelist, validated against
  `lib/tool-names.ts`; model routing stays global.
- `get_goals` tool (AI reads goals, never infers) + whitelist entries.
- `local_kb/wiki/` read-only: `GET /api/wiki`/hub listing; writes rejected.
- Project docs list works (BWP_PRD_V3, 37,942 chars).

**Still pending:** Obsidian launch button, PM→Architect approval flow, global
search, insights; mobile untouched.

## 7. Router & migration — proposed (2026-11-10)

### UI router

```
/desktop                              Hub (no composer)
  ├─ today cards / Workpad cards / recent activity
  └─ settings tab (global fenshen prompt + tools)

/desktop/workpad/[project_id]         Workpad detail (IDE-level room)
  ?tab=chat|artifacts|issues          tabs (client state)
  ├─ main: chat (read-only until approved) / artifacts / issues
  └─ inspector: participating fenshen + model (global vs per-fenshen)
```

- Hub cards link to the detail route; the Hub middle column holds only today's
  data, Workpad cards, and recent activity.
- The old Hub composer and goals widget are removed from `/desktop`; the goals
  will move into the Workpad inspector in the interaction phase.

### Migration 040 (applied)

```sql
project_fenshen_map(project_id, fenshen_id, is_lead, created_at)
fenshen.model_name text                     -- null = global router
messages.responder_fenshen_id text          -- who answered (for UI)
seed: yuanying→xiaowu(lead); bwp→ai_pm(lead), ai_architect; aso→ai_pm(lead)
```

**DEVIATION:** the blueprint says `fenshen_templates.model_name`; `fenshen` is
the existing template table, so the column lives there (no duplicate table).

### Chat contract (next phase, needs approval)

Request: `{ message, project_id, active_fenshen_ids?: string[] }`.

1. Server resolves the room from `project_fenshen_map` (client ids are an
   override, never trusted blindly).
2. Responder = `@mention` → matching member; else `is_lead`; else first member.
3. Model = responder `fenshen.model_name` (looked up in `models` by id or
   model_name) → else `config.active_model_id` (global).
4. Reply is stored with `responder_fenshen_id` + `metadata.active_fenshen_ids`;
   the assistant prompt is the responder's `prompt_md` + whitelist.
5. Relay: a `@next_fenshen` prefix in the responder's output can enqueue one
   follow-up turn (max 2 hops) — to be designed before implementation.

### Implemented now

- `/desktop` refactor (no composer): today cards, Workpad cards, recent activity.
- `/desktop/workpad/[project_id]`: tabs (chat read-only / artifacts / issues),
  inspector with real room members.
- APIs: `GET/PUT /projects/[id]/fenshen`, `GET /projects/[id]/artifacts`,
  `GET /projects/[id]/issues` (label `project:<id>`).
- Migration 040 applied and seeded.

### Pending confirmation

- Chat interaction (composer, @routing, relay) and per-fenshen model selector.
- Membership editing in the inspector (PUT API exists).

## 8. Non-goals (explicit)

- No mobile UI changes (per owner).
- No infrastructure/hosting change (Vercel pause / Coolify is separate, ES-074).
- No new heavy dependency (no component library; Tailwind + existing primitives).
- No change to tracking ingestion (`signals` / collector) — read-only consumers.

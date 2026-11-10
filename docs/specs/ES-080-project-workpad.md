# ES-080 — Project Workpad Architecture (BWP Integration)

- **Status:** In Progress (owner UI confirmation pending). **Tracking:** P2-61.
- **Model:** Project → Role (fenshen) → Workpad (chat + memory) → Artifact.
- **Numbering:** the P0 data/feedback task moved from ES-080 to **ES-084**.

## 1. Data

- `projects` (`id, name, description, status`) seeded with `yuanying`, `bwp`, `aso`.
- `messages.project_id` and `signals.project_id` added; existing rows backfilled to
  `yuanying`.
- `project_docs(project_id, name, content, updated_at)` — cloud-stored project
  documents (PRDs). BWP_PRD_V3.md seeded (37,942 chars).
- This is an explicit exception to the local-first rule **for project PRDs**; the
  private conversation KB stays local.

## 2. Backend

- `/api/projects` (list/create) and `/api/projects/docs` (list/upload).
- `/api/chat` accepts `project_id`: history is filtered by project, new messages
  are persisted with it, and the prompt carries the project + document names.
- New tool `read_project_doc(project_id, filename)` reads the cloud copy (60k
  cap) — no absolute paths. Added to `ai_pm` and `ai_architect` whitelists.
- `/api/history?project_id=…` for the UI.

## 3. UI

- Project selector next to the fenshen selector (persisted in
  `localStorage.yy_project`); switching reloads that project's history.
- `postChat` sends `project_id`.

## 4. Evidence (2026-11-10)

```
[project] bwp docs=BWP_PRD_V3.md
[fenshen] ai_pm active_tools=…,read_project_doc,…
PM request: "read BWP_PRD_V3.md then write a V4 skeleton"
→ read_project_doc loaded the cloud doc; write_local_file wrote
  ~/yuanying/local_kb/docs/BWP_PRD_V4_cloud.md (3,775 bytes)
→ messages persisted with project_id=bwp (verified in Postgres)
```

## 5. Acceptance

- [x] `projects` table + seed.
- [x] Project-scoped chat history (backend verified; UI selector built).
- [x] AI-PM reads the cloud PRD and outputs V4 without path errors.
- [ ] DSH receives the workpad conclusion and creates a GitHub Issue
      (`push_to_dev` is available; an explicit handoff test is pending).

# ES-086 — Supervisor Tools & Skills

**Status:** Done (2026-11-14)
**Owner:** xiaowu (小悟)

## Tools

| Tool | Backend |
|---|---|
| `create_issue` | GitHub Issue + ledger action |
| `list_issues` | GET /issues (state/labels/limit) |
| `assign_issue` | label `fenshen:<id>` + `@name` comment + **Workpad message with issue body**; optional GitHub assignee |
| `comment_on_issue` | POST /issues/{n}/comments |
| `update_issue_status` | PATCH /issues/{n} state |
| `list_pull_requests` | GET /pulls |
| `get_project_status` | internal aggregate |
| `plan_actions` | umbrella issue + ledger |
| `write_local_file` | local file (conflict report) |

All GitHub calls use the **xiaowu-scoped App installation token**, not the global PAT.

## Skills

`fenshen.skill_prompt` for xiaowu now contains the Program Manager SOP:
requirement routing, progress audit, loop closure, information aggregation.

## Verified

- Owner request → `create_issue` → **[Epic] Xiaowu supervisor test** (#164);
- `assign_issue` → label `fenshen:ai_pm`, bot comment `@拓维 请基于此输出 PRD`;
- Issue closed and test action cleaned;
- “项目进度如何” → tool-backed 3-sentence report (open issues #104/#105/#106 etc.).

## Important limitation

GitHub has no per-fenshen user accounts. Assignment is **logical**:
- label `fenshen:<id>`
- bot comment `@display_name`
- optional native assignee if a GitHub username is supplied.

A fenshen does not poll GitHub comments. `assign_issue` now posts the issue
title/body/link into the Workpad room **and fires a local handoff call** to the
assignee (`lib/handoff.ts`), so the assignee actually wakes and can read the
issue. GitHub comments alone still do not wake any fenshen.

## Not included

- `comment_on_pr` / `merge_pr` (owner merge remains manual; xiaowu cannot merge)
- automated handoff state machine
- scheduled patrol (approval #5 still proposed)

# ES-089 — PM & Architect handoff tools

**Status:** Done (2026-11-14)
**Refs:** ES-088, ADR-005

## Tools

### 拓维 (ai_pm) additions

- `comment_on_issue` — append PRD to Issue
- `assign_issue` — assign to architect (or another fenshen)
- `get_github_issue` — read Issue + comments

### 阿构 (ai_architect) additions

- `comment_on_issue` — append ADR to Issue
- `assign_issue` — assign to DSH
- `get_github_issue` / `read_code_file` already present

Neither role has `update_issue_status`: closure stays with xiaowu/owner.

## Token broker

All GitHub calls use the **actor's** App installation token, not the target's:

| Role | Contents | Issues | PRs | Actions |
|---|---|---|---|---|
| ai_pm | read | write | read | — |
| ai_architect | read | write | read | — |
| dsh | write | write | write | — |

The actor/target distinction is `actor_fenshen_id` (request fenshen) vs
`fenshen_id` (assignee). This was a bug in the first pass: architect assignment
used the **target** DSH token. Fixed.

A PM/architect token cannot write code contents; GitHub returns 403 if attempted.

## Acceptance evidence (#174)

- PM PRD comment: 2026-11-14T23:45:08Z (App bot)
- PM `assign_issue` → architect (Workpad + auto-handoff)
- Architect ADR-006 comment: 2026-11-15T00:03:26Z
- Architect `assign_issue` → DSH: 2026-11-15T00:03:29Z
- Owner did not relay the handoff; auto-handoff woke architect.

## Limits

- Model compliance: the ADR/assign required one explicit instruction; the tools
  and tokens work, but the LLM doesn't always call them from a vague handoff.
- DSH auto-handoff is wired; DSH's implementation is outside this acceptance.
- `update_issue_status` remains supervisor/owner-only.

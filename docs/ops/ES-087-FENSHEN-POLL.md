# ES-087 — Fenshen idle GitHub polling

**Status:** Done (2026-11-14), approval #5.
**Scope:** all enabled fenshen in project rooms.

## Rules

- **Idle 15m** (no user message in the project) → full check:
  assigned open/closed issues, new comments, state changes.
- **Every 30m** → light check: new comments / new assignments only.
- **Assignment** is the `fenshen:<id>` label (written by xiaowu's `assign_issue`).
- **First run is a silent baseline** (no replay of historical issues).
- **Change** → one Workpad assistant message, e.g.
  `巡检 拓维：#166 新指派…` plus issue title/body/link; **no change → silent**.
- No LLM call; deterministic notification. No token cost.
- State: `fenshen_poll_state` (last_full_at, last_light_at, seen JSONB).

## Scheduling

`launchd com.yuanying.sync` every 60s:

```
flush → pull → actions → /api/cron/fenshen-poll
```

The endpoint gates full/light checks; it does not poll every minute.

## GitHub auth

Each fenshen uses its **role-scoped GitHub App installation token**
(`github-token.ts`), so a role can only read the issues its permissions allow.

## Verified

- Baseline: 13 checks, no messages.
- Created `#166` with `fenshen:ai_pm` → force full poll:
  `巡检 拓维：- 新指派：fenshen:ai_pm → #166 …`; message persisted locally.
- Test issue/comment/message cleaned.

## Limits

- Poll notifications are notification-only. **Assignments** are different: the
  `assign_issue` tool triggers a local auto-handoff and wakes the assignee.
- A fenshen in multiple rooms shares one poll state. The notification is posted
  to the project that owns the issue in the ledger (fallback: first mapped
  room), so #168 lands in `yuanying` rather than `aso`.
- Only label-based assignment; native GitHub assignee is optional.

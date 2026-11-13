# ES-085 — GitHub-anchored action ledger (#130)

## Schema

`workpad_actions` now has:

- `github_issue_number integer`
- `github_issue_url text`

Constraint (PostgreSQL):

```
status not in ('pending','in_progress') or github_issue_number is not null
```

Verified: inserting a pending row without a number fails with
`violates check constraint "workpad_action_issue_required"`.

## Reconciliation

`scripts/reconcile-actions.mjs` anchors existing rows to canonical issues:

| action | issue |
|---|---|
| 12 Playbook | #128 (closed) |
| 13 whitelist | #102 |
| 14 collector | #119 |
| 15 Desktop Hub | #104 |
| 16 Librarian | #105 |
| 17 FTS5 | #106 |
| 18 approval | #107 |
| 19 events | #108 |
| 20 @ routing | #129 (closed) |

#129 was missing from the ledger; it was inserted and then flipped to done by the
status poll after the issue closed.

## plan_actions

- Creates a GitHub issue per action **before** writing the ledger.
- If any issue creation fails, returns `success:false` and writes no rows.
- Stores `github_issue_number/url` and `result_ref`.

Verified: `plan_actions` probe → issue **#132** created; ledger row linked;
issue closed → poll flipped row to `done`.

## Status sync

`lib/action-sync.ts` + `/api/sync/actions` (CRON_SECRET):
- checks pending/in_progress rows with a number,
- GitHub issue closed → `status=done`, `result_ref=issue_url`,
- launchd `com.yuanying.sync` runs every 60s (flush → pull → actions).

## UI

Workpad 新增「台账」tab：状态、描述、#issue 链接；缺少 issue 时红字提示。

## Acceptance

- [x] 13–18 five pending actions have issue numbers/URLs.
- [x] New `plan_actions` task immediately creates GitHub issue (#132).
- [x] Closing the issue flips the action to done via the 60s poll (verified with #129/#132).

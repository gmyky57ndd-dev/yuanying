# ES-134 — Human-in-the-loop approval node

## Model

`work_approvals` (renamed from `approvals`) adds `issue_number`:

- `project_id, title, description, adr`
- `status`: proposed → adr_ready → approved → rejected → implementing → done
- `approved_by`, `approved_at`, `issue_number`, `issue_url`, timestamps

## State machine

- `submit_adr` / `POST /api/approvals` action `adr` → `adr_ready`
- owner `approve` (only from `adr_ready`) → `approved`
- owner `reject` → `rejected` (kept; `reopen` → `proposed`)
- `push_to_dev` **requires** an `approval_id`; no id is rejected:
  - only `approved` may create an issue;
  - issue created → `status=implementing`, `issue_number/url` backwritten;
  - `implementing` + issue number is idempotent (returns the same issue);
  - any other status → `success:false`, no issue.
- Approval-backed pushes are **never queued** on GitHub timeout (no ghost tasks).

## Visibility

- `/api/approvals?project_id=` returns full chain including `issue_number/url`.
- Workpad「审批」tab shows status, ADR, issue link.
- `get_project_status` exposes the same table.

## Evidence

- No `approval_id` → `approval_id required; only an owner-approved item may push_to_dev`; GitHub search found 0 issues.
- Unapproved (`proposed` #5) → `approval #5 is proposed; only 'approved' may push_to_dev`; 0 issues.
- Approved probe #6: created issue **#135**, status `implementing`, `issue_number=135`, `issue_url` backwritten.
- Reject probe → `rejected`, `issue_number=null`, no issue.
- #135 closed after validation; probe approval removed.

## Note

#102 (whitelist enforcement) remains open; approval gate was delivered in parallel. The gate is enforced at `push_to_dev`, so acceptance 1–3 are testable.

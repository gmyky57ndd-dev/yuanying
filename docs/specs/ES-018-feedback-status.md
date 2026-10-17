# ES-018 — Feedback Status & Inbox Commit

**Status**: Approved
**Category**: Feature (completion of ES-014)
**Refs**: ES-014, ES-016
**Tracking**: P1-47

## 1. The Problem

- Save to Inbox sets `value.promoted = true` but does not write a file.
- Dev is notified only via Push to GitHub (issue creation). Save to Inbox is
  silent.
- No way to tell if feedback is handled.

## 2. Schema Change

Use **Option B** — a dedicated column:

```sql
alter table signals add column if not exists feedback_status text
  check (feedback_status in ('new', 'inbox', 'pushed', 'resolved'));

create index on signals (feedback_status) where feedback_status is not null;
```

## 3. Save to Inbox — commit the file

Endpoint: `POST /api/integrations/inbox`

- Write `docs/pm/inbox/YYYY-MM-DD-<noteId>.md` via the GitHub Contents API
  (`PUT /repos/{repo}/contents/{path}`), base64 content.
- On success: status → `inbox`, file committed, dev sees the commit.
- On failure: status stays `new`, the user sees an error, can retry.

## 4. Push to GitHub — update status

After issue creation succeeds:

- `feedback_status = 'pushed'`
- store `github_issue_url` (issue link) on the note.

## 5. Mark Resolved — new action

In the Feedback tab, add **[Mark Resolved]**. It sets
`feedback_status = 'resolved'`. Only notes with status `inbox` or `pushed` can
be marked resolved.

## 6. UI: Status Chips

Each feedback note shows its status, small, stone-toned, one word:

```
[new]       — not yet sent
[inbox]     — file committed to docs/pm/inbox/
[pushed]    — GitHub issue created (#123)
[resolved]  — owner marked as handled
```

No color coding (avoid emotional weight).

## 7. AI Self-Awareness (system-manifest.md)

```markdown
## Feedback Status
Each feedback note has a status:
- `new`: Not yet sent anywhere.
- `inbox`: Committed to `docs/pm/inbox/` in the repo. Dev reads on next pull.
- `pushed`: GitHub issue created. Dev notified immediately.
- `resolved`: Owner marked as handled.

When the user asks "did you send that?", check `feedback_status` before answering.
If status is `new`, say: "还没发。要我发到 inbox 还是 GitHub？"
```

## 8. Acceptance

- [ ] `feedback_status` column exists with valid values.
- [ ] Save to Inbox commits `docs/pm/inbox/YYYY-MM-DD-<id>.md` via GitHub API.
- [ ] Status → `inbox` on success, stays `new` on failure.
- [ ] Push to GitHub sets `pushed` and stores `github_issue_url`.
- [ ] [Mark Resolved] exists in the Feedback tab.
- [ ] Status chip visible in the Feedback list.
- [ ] `system-manifest.md` explains feedback status.
- [ ] 元婴 answers "did you send it?" from the status.

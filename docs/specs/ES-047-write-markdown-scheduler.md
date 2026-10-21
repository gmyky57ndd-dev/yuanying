# ES-047 — Agent Tools: write_markdown & scheduler

**Status**: Approved
**Category**: Feature (Tooling / Safety)
**Tracking**: P2-28
**Refs**: Issue #50

## 1. write_markdown(path, content)

- Writes an allowlisted `core/` Markdown file through the GitHub Contents API,
  creating a real Git commit. The previous version remains in Git history.
- Allowed:
  - `core/ground-rules.md`
  - `core/habits.md`
  - `core/opinions/*.md`
  - `core/memory/conversations/*.md`
- Not allowed: `identity.md`, `voice.md`, `values.md`, Fenshen profiles, or
  arbitrary paths.
- Requires explicit owner request and confirmation of the full draft.
- Max content: 100,000 chars.
- Returns `{ success:true, data:{ path, action, commit_sha, url, backup:'git history' } }`.

## 2. scheduler(time, action)

- Creates one `scheduled_message` reminder at a local `HH:MM` time.
- Reuses the existing reminder poller (`/api/reminder/due`).
- Max 3 pending scheduled messages; the model cannot edit or delete existing
  timers.
- Time must be `HH:MM`; action max 200 chars.
- Returns the resolved `scheduled_at` and timezone.

## 3. Acceptance

- [x] `write_markdown` rejects non-allowlisted/traversal paths (verified locally).
- [x] Writes are Git commits with the prior version recoverable.
- [x] `scheduler` creates a limited one-shot reminder (verified locally; reminder removed).
- [ ] Owner confirms a real write and a scheduled reminder on the phone.

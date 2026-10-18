# ES-023 — Feedback Lifecycle & Copy/Send Separation

**Status**: Approved
**Category**: Bug (UI/Architecture) + Documentation
**Tracking**: P1-54
**Refs**: Issue #14, ES-012, ES-017, ES-018
**Supersedes**: the overlapping ES-024 draft (same issue; merged here)

## 1. The Problem

The owner has repeatedly asked how `Copy for Dev`, `Copy for AI`,
`Save to Inbox`, and `Push to GitHub` relate. The feedback state machine
(`new → inbox → pushed → resolved`) only covers the sending actions. Copy
actions are local clipboard operations, but they were presented next to
sending actions and looked equivalent.

`Copy for Dev` was renamed to `Push to GitHub` in ES-016 and is already gone
from the UI. The remaining confusion is:

- `Copy for AI` is still labeled like a delivery action.
- Status is shown as plain `[new]` / `[inbox]` text, not a clear badge.
- There is no lifecycle diagram.
- `docs/pm/inbox/` has no README explaining how Dev consumes it.

## 2. Required Changes

### 2.1 UI: separate local from sending

Files: `app/page.tsx`, `app/feedback/page.tsx`,
`components/FeedbackStatusBadge.tsx`.

- Remove any remaining `Copy for Dev` label (already removed; verify none
  remain).
- Rename `Copy for AI` to **Copy as Text** in both the notes list and the
  Feedback tab. Keep the chat message action as **Copy**.
- Put local actions in a visually separate group from sending actions:
  - Sending: **Push to GitHub**, **Save to Inbox**, **Mark Resolved**.
  - Local: **Copy as Text**.
- Add a colored status badge in both places:
  - `new` — stone
  - `inbox` — sky
  - `pushed` — violet
  - `resolved` — emerald
- Do not add a `Copy for Dev` action back. Sending to Dev means
  **Push to GitHub** or **Save to Inbox**.

### 2.2 State machine and documentation

Files: `docs/feedback-lifecycle.md`, `docs/pm/inbox/README.md`,
`core/system-manifest.md`.

`docs/feedback-lifecycle.md` must include:

- A Mermaid flowchart from **记一笔 / 标记为反馈** through `new`, `inbox`,
  `pushed`, and `resolved`.
- A table of actions, DB effects, Dev visibility, and status transitions.
- An explicit statement that copy actions are local and do not change status.
- Failure behavior: failed Save/Push leaves the previous status; Resolved is
  only allowed from `inbox` or `pushed`.
- The fact that closing a GitHub issue does **not** automatically set
  `resolved`; the owner marks it resolved (no webhook in this scope).

`docs/pm/inbox/README.md` must explain:

- File naming: `docs/pm/inbox/YYYY-MM-DD-<noteId>.md`.
- Dev reads on the next pull; target review time 10:00 daily when that cadence
  is in use.
- After handling: move to `docs/pm/inbox/archive/` (preferred) or prefix with
  `[已处理]`.
- Do not delete inbox history as routine cleanup.

`core/system-manifest.md` must describe the same state machine and explicitly
say that **Copy as Text** / **Copy** are local actions outside it.

### 2.3 No backend behavior change required

`feedback_status` transitions already work in:

- `app/api/note/[id]/route.ts` — sets `new`, accepts `resolved` only from
  `inbox`/`pushed`.
- `app/api/integrations/inbox/route.ts` — sets `inbox` on commit; does not
  regress `pushed`/`resolved`.
- `app/api/integrations/github/route.ts` — sets `pushed` and stores the issue
  link; rejects Push for a note already marked `resolved` with
  `409 note already resolved`.

If a change touches these routes, preserve those rules. `resolved` is
terminal. There is no new migration in this item.

## 3. Fallback Behavior

- Clipboard unavailable → show a copy-failed alert; no state changes.
- Save to Inbox fails → status stays `new`; show the API error.
- Push to GitHub fails / token missing → status stays unchanged; the existing
  clipboard fallback copies the issue text, which is local only.
- `resolved` from `new` → API rejects with 400.
- Push from `resolved` → API rejects with 409; the UI disables the button.
- Duplicate Push → return the existing issue (`already: true`) instead of
  creating another.

## 4. Acceptance

- [ ] `Copy for Dev` does not appear in the UI.
- [ ] `Copy as Text` is visually grouped as a local action, separate from
      **Push to GitHub** / **Save to Inbox**.
- [ ] Both the notes list and the Feedback tab show a colored status badge.
- [ ] `docs/feedback-lifecycle.md` exists and contains a Mermaid diagram.
- [ ] `docs/pm/inbox/README.md` exists and explains consumption and marking.
- [ ] `core/system-manifest.md` matches the implemented state machine.
- [ ] `npx tsc --noEmit` and `npm run lint` pass.
- [ ] Production deployment contains the new labels and docs.

## 5. Out of Scope

- A GitHub webhook that automatically sets `resolved` when an issue closes.
- Deleting or rewriting historical feedback/inbox records.
- Changing the four-state model.

# Conversation Record — AI Capture & Feedback Loop

**Span**: 2026-10-16
**Participants**: Owner, 元婴 (in-formation)
**Topic**: AI session capture, self-diagnostic voice, notes enhancement
**Status**: Distilled. Raw transcript not retained.

This is a memory file. Read-only after save. Editing is false memory.

---

## What this conversation was

Continued the design cycle from 2026-10-14. Focus shifted from
foundation (ES-005 through ES-009) to three enhancements: capturing
AI sessions as memory, fixing 元婴's diagnostic voice, and turning
note capture into a feedback pipeline.

---

## Decisions

### AI session capture (ES-010)

- **D1** — v1 is manual: share sheet on mobile, drag-drop folder on
  desktop. No new capture surface.
- **D2** — Records land in `memory/conversations/YYYY-MM-DD-<slug>.md`
  following the ES-005 format.
- **D3** — A standard export prompt is provided. Owner pastes into any
  AI session; the AI produces a distilled record.
- **D4** — Retrieval is tag-based, not embeddings (v1).
- **D5** — Auto-capture from browser tabs deferred to P4 (laptop
  companion).

### Self-diagnostic voice (ES-011)

- **D6** — Rule: query own data before asking owner. State what you
  see, what you cannot see, propose one direction.
- **D7** — No menus. No "要我看哪一步?". Pick one.
- **D8** — Collector must log provenance for every signal: value,
  source, window, aggregation. Without this, 元婴 cannot reason
  about its own data.
- **D9** — Steps bug correction: Fit and Watch are independent
  measurements. Their agreement (~950) is signal. HealthConnect-via-
  元婴 showing 2700 is the outlier. Bug is in what the collector
  reads, not source summation.

### Notes enhancement (ES-012)

- **D10** — Auto-derived tags. Visible. Editable. Never required.
  No fixed taxonomy. Owner never *must* categorize.
- **D11** — Feedback loop is one-way: owner → dev. Staging area in
  `docs/pm/inbox/`. No auto-write to TRACKING.
- **D12** — 元婴 proposes the feedback flag on likely-feedback notes;
  owner confirms.
- **D13** — Weekly review promotes inbox items to PM docs.

---

## Held open

- **H1** — Whether tags evolve toward a loose vocabulary or get
  standardized. Owner said "start from somewhere, adjust later."
- **H2** — Whether feedback loop stays one-way. Revisit if two-way
  becomes necessary.
- **H3** — Whether 元婴 should auto-file bug reports when it detects
  its own sensors failing. Noted, not designed.
- **H4** — Retrieval over raw transcripts. Deferred.

---

## Observations about owner

- Corrects quickly when a hypothesis is wrong. "You cannot add Fit
  and Watch — they are independent" landed the correction cleanly.
- Comfortable with "start from somewhere, adjust later." Not seeking
  perfect designs. Seeking to move.
- Wants the tool to serve a real problem: reducing back-and-forth
  copy/paste between owner and dev.
- Prefers the 元婴 to have opinions and to propose, not to present
  menus.
- Notices when I over-theorize before data. Flagged it once. Correct.

---

## Signals in owner's words

- "the steps, you cannot add fit and watch they are independent. it
  just meant that the fit and watch are close to the truth. health
  connect via 元婴 is not -> this is the bug."
- "start with auto derived tag and one way feedback - agreed. we may
  adjust and re-align later but need to start from somewhere."
- "Would like to use yuanying note capture as part of feedback loop
  as well to reduce back and forth copy paste."
- "For AI sessions, we could start with manual - ask each chat to
  produce summary for topics and manually feed that into yuanying.
  folder may not be a bad idea."
- "chat does not just happen on computer so we need design a better
  automated flow both on mobile and computer."

---

## Related artifacts

- `docs/specs/ES-010-ai-session-capture.md`
- `docs/specs/ES-011-self-diagnostic-response.md`
- `docs/specs/ES-012-notes-enhancement.md`
- `TRACKING.md` — P1-23, P1-35 through P1-39
- `core/voice.md` — "When something is wrong" section (via ES-011)
- `AGENTS.md` — §5.1 provenance rule (via ES-011)

---

**End of record.**
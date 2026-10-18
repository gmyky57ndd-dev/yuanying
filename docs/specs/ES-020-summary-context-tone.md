# ES-020 — Daily Summary Context & Tone Fix

**Status**: Approved
**Category**: Bug (Prompt/Logic) + Feature (Data Integration)
**Tracking**: P1-48

## 1. Data Pipeline Fix

File: `lib/summary-generator.ts` (daily summary data/prompt).

The daily summary must include:
- **Notes from the target day** — all owner notes, under `## Owner's Notes`.
- **AI conversations from the target day** — the distilled record from
  `core/memory/conversations/YYYY-MM-DD-*.md` (if it exists), under
  `## AI Conversations`.

## 2. Prompt & Tone Fix

File: base system prompt (`lib/yuanying.ts`) / Fenshen prompt.

```markdown
## Daily Summaries
- Do not just summarize numbers.
- If the owner wrote notes or had AI conversations, those are the priority.
  Steps and water are secondary context.
- DO NOT give unsolicited health advice (e.g. "drink more water", "sleep
  earlier") unless the owner explicitly asks for a health critique.
- Instead, reflect the owner's inner state. Connect the physical data to the
  mental state (e.g. "You walked 4630 steps and wrote a note about feeling
  stuck on the proposal. It was a heavy day.").
- If there are no notes, say "No notes yesterday." rather than just reporting
  steps.
```

## 3. Acceptance

- [ ] The daily summary explicitly mentions the owner's notes and project context.
- [ ] The summary stops acting like a fitness coach.
- [ ] If no notes exist, the summary says "No notes yesterday." rather than just reporting steps.

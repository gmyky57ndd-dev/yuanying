# ES-027 — Elevate Summary Tone (Partner vs QA)

**Status**: Approved
**Category**: Prompt Update
**Tracking**: P2-11
**PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/19

> **Tracking note**: the handoff requested **P2-06**, but P2-06 is the completed
> Phase C / ES-026 item. This work is recorded as **P2-11** in `TRACKING.md`.

## 1. Problem

The daily summary reads like a QA log ("验了三条链路") instead of a reflective
narrative ("今天我们打通了神经系统"). It also ends with a passive menu
("要写进去吗？") instead of drafting the summary and asking to save it.

## 2. Rules

Add these rules to the daily-summary prompt:

- **Focus on meaning.** Do not just list technical bugs. Describe what the
  technical work means for the project or the owner's state.
- **First person plural ("we").** Use "we" or "I" (元婴), not just "you"
  (Owner). The day belongs to both.
- **No empty menus.** Do not ask the owner to choose what to summarize. Draft
  the summary, then ask "Shall I save this?" (要我存下来吗？).

## 3. Implementation

The daily-summary prompt is assembled in `lib/yuanying.ts` under
`## Daily Summaries`; `lib/summary-generator.ts` builds the numeric data, not
the prose prompt.

- `lib/summary-generator.ts` exports `SUMMARY_TONE_RULES`.
- `lib/yuanying.ts` imports and injects those rules into the Daily Summaries
  section.
- The existing priority for owner notes and AI conversations is unchanged.

## 4. Acceptance

- [x] The prompt contains the meaning / first-person-plural / no-empty-menu
      rules.
- [x] The rules are present in the runtime system prompt.
- [ ] Owner verifies a real summary reads as a reflection, not a QA log, and
      ends with a draft confirmation.

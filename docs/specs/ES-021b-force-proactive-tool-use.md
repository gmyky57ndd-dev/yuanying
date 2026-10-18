# ES-021b — Force Proactive Tool Use

**Status**: Approved (implemented 2026-10-18; production verification pending)
**Category**: Bug (Prompt/Behavior)
**Refs**: ES-021, P1-49
**Tracking**: P1-52

> **Tracking note:** the handoff labeled this item P1-50, but P1-50 is
> ES-018 feedback status. Following the owner-ID convention, this item is
> **P1-52**.

## 1. The Problem

元婴 has the `get_notes`, `get_conversation_records`, and `get_summary` tools,
but it defaults to "I don't know" or gives a shallow answer instead of
querying. It waits for the user to explicitly say "call the tool."

The existing runtime prompt says to answer real-data questions "only from the
data below" and to say "I don't know" when data is missing. Read in isolation,
that tells the model to skip the tools.

## 2. Required Behavior

Add this rule to `core/system-manifest.md` under the **Tools (法术)** section:

```markdown
## Rule: Proactive Tool Use
If the user asks about past events, notes, or specific design decisions:
1. You MUST call the appropriate tool (e.g., `get_conversation_records` or
   `get_notes`) BEFORE answering.
2. NEVER say "I don't have the full text" or "It's not in my context" without
   first querying the database.
3. If the tool returns a file, quote the relevant section directly.

Example:
User: "How did we decide on the Fenshen architecture?"
You: [Calls get_conversation_records("Fenshen")] -> [Reads ES-013] ->
"We decided to separate the Core State from the Interface..."

Do not fabricate past notes or conversations.
```

Add this clause to the runtime prompt in `lib/yuanying.ts`
(`buildSystemPrompt`, immediately after the "Answer real-data questions"
paragraph):

```text
If the owner asks about past notes, past conversations, or a design/architecture
decision, call the matching tool (get_notes, get_conversation_records,
get_summary) before answering. Do not say "I don't have the full text" or
"It's not in my context" until the tool has returned nothing.
```

`lib/yuanying.ts` is a template literal; do **not** use backticks inside the
added prompt text.

## 3. Tool and Fallback Behavior

Tool definitions and execution already exist in `app/api/chat/route.ts`
(`TOOLS`, `runTool`). This spec does not change them.

- Empty keyword / invalid date → `runTool` returns
  `{ error: 'keyword required' }` or `{ error: 'date must be YYYY-MM-DD' }`.
  元婴 must report that it could not search, not invent a result.
- No matching records → the tool returns an empty list; only then may 元婴 say
  it found nothing.
- Tool throws → `app/api/chat/route.ts` returns `{ error: 'tool failed' }` to
  the model; 元婴 must say the lookup failed, not fabricate.
- Model chooses not to call a tool → the prompt is the only control
  (`tool_choice` stays `auto`). Do not force every message through a tool.
- Tool loop exhausted (3 rounds) or DeepSeek timeout → existing route behavior
  applies; do not add retries in this change.

`docs/system-manifest.md` is a stale, unused copy. It is not loaded by
`buildSystemPrompt()`; do not edit it for this work.

## 4. Files Changed

- `core/system-manifest.md` — add **Rule: Proactive Tool Use**.
- `lib/yuanying.ts` — add the runtime clause in `buildSystemPrompt`.
- `TRACKING.md` — add P1-52 and changelog entry.

## 5. Acceptance

Verify against production after deploy.

- [ ] Ask a past-decision question with no tool hint, e.g.
      "我们之前关于 Fenshen 是怎么决定的？". The server log shows
      `tool_call get_conversation_records { keyword: 'Fenshen' }`, and the
      reply quotes the decision from `docs/specs/ES-013 — Fenshen
      Architecture.md`.
- [ ] Ask "昨天我写了什么笔记？". The server log shows
      `tool_call get_notes { date: 'YYYY-MM-DD' }`, and the reply lists the
      actual notes.
- [ ] Ask about a topic with no records. 元婴 says it found no matching
      records (after the tool runs), rather than claiming it lacks context
      without querying.
- [ ] 元婴 no longer gives a shallow answer when the DB holds the relevant
      context.

# ES-010 — AI Session Capture

**Status**: Approved
**Category**: Feature
**Depends on**: ES-005 (conversation records as memory)
**Tracking**: P1-35

---

## 1. Purpose

Let the owner capture distilled records of AI conversations (Claude,
ChatGPT, Gemini, etc.) as part of 元婴's memory. v1 is manual. v2 is
automatic.

**v1 principle**: no new capture surface. Rides on share sheet (mobile),
drag-drop (desktop), and folder import.

---

## 2. Flow — mobile

From any app (Claude mobile, ChatGPT mobile, browser):

1. Share sheet → "Send to 元婴"
2. Prompt: one-line context (optional)
3. Optional: paste the AI's summary, or capture a screenshot
4. Save → writes `memory/conversations/YYYY-MM-DD-<slug>.md`

If the AI can produce a summary itself, the owner pastes it in step 3.
If not, the owner types a 3-line summary. The 元婴 does not distill raw
transcripts (they're not available via share sheet).

## 3. Flow — desktop

Drag an `.md` file into `~/yuanying/imports/conversations/`.
A watcher (v1: manual command `yuanying import`; v1.1: auto on file
change) ingests it.

Same target: `memory/conversations/`.

## 4. Standard export prompt

元婴 provides a one-line prompt the owner can paste into any AI session
before exporting:

> "Produce a distilled record of this conversation in the following
> format: [decisions] [held open] [observations about me] [signals in
> my own words]. Keep under 500 words."

Paste the output into 元婴's share flow (mobile) or save it as `.md`
(desktop). The 元婴 normalizes into the standard record format.

## 5. Record format

Follows `memory/conversations/YYYY-MM-DD-<slug>.md` from ES-005.

Required header:
- span (start–end dates)
- participants (owner, which AI, which topic)
- status: distilled

Required sections:
- Decisions
- Held open
- Observations about owner
- Signals in owner's words (verbatim quotes)
- Related artifacts

## 6. Auto-topic tagging

元婴 extracts topic tags from the record. Stored in 元婴 metadata.
Used for retrieval ("上次聊到元婴设计的那次对话").

Tags not required from owner. Not edited by owner (they're 元婴's
side — see ES-012 for user-visible tags on notes).

## 7. Retrieval

Records are not all loaded into context.

- 元婴 loads a record when its topic tags match the current session topic
- Topic match threshold: same topic tag appears in session and record
- No embeddings in v1 — tag matching only

## 8. Out of scope (v1)

- Auto-capture from browser tabs (P4)
- Auto-distillation of raw transcripts
- Cross-device sync of the imports folder
- Editing records after save (per ES-005)

## 9. Acceptance

- [ ] Mobile share sheet target "Send to 元婴" exists
- [ ] Desktop folder `~/yuanying/imports/conversations/` exists
- [ ] `yuanying import` command ingests .md files
- [ ] Records saved to `memory/conversations/` in standard format
- [ ] Topic tags extracted and stored
- [ ] Session retrieval works by topic match
- [ ] No new capture surface in the PWA

## 10. Tracking

```markdown
### [P1-35] AI session capture — manual + folder (v1)
- Status: To Do
- Category: Feature
- Refs: ES-010
```

**End of ES-010.**

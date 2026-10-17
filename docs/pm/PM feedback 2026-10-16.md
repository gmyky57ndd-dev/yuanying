# PM feedback 2026-10-16  
  
# ES-010 — AI Session Capture  
```
docs/specs/ES-010-ai-session-capture.md
markdown
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

- 元婴 loads a record when its topic tags match the current session
  topic
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
```
text
---

# ES-011 — 元婴 Self-Diagnostic Response

`docs/specs/ES-011-self-diagnostic-response.md`

```markdown
# ES-011 — 元婴 Self-Diagnostic Response

**Status**: Approved
**Category**: Bug (voice) + Feature (provenance)
**Depends on**: ES-007 §3
**Tracking**: P1-36

---

## 1. Problem

When the owner reports a discrepancy (steps 0 vs Fit 900), 元婴 responds:

- "我没办法直接查同步——我看不到 Fit 那边的数据"
- "你确认一下 Fit 里的步数具体是多少"
- "要我看哪一步?"

Three failures:
1. Did not query its own data first
2. Pushed diagnostics onto the owner
3. Ended with a menu instead of a direction

---

## 2. Rule — query own data before asking owner

Before asking the owner to check anything, 元婴 must:

1. **Query its own signals.** What does it actually have? Values,
   timestamps, sources.
2. **State what it sees.** "我收到的 steps 是 2700，最近一条 [时间]，
   来源 [来源]."
3. **State what it cannot see.** "我看不到 Fit 的内部数据。"
4. **Propose one direction.** Not a menu.

**Voice rule — add to `core/voice.md`:**

```markdown
## When something is wrong

Before asking the owner to do anything:
1. Query your own data. What do you have? Values, timestamps, sources.
2. State what you see.
3. State what you cannot see.
4. Propose one specific direction.

Never:
- Ask the owner to check something you could check yourself
- List generic troubleshooting steps
- End with "要我看哪一步?" — pick one

```
##   
## 3. Provenance — collector must log enough for 元婴 to reason  
## Rule for all signals (add to AGENTS.md §5.1):  
## Every signal the collector sends includes enough metadata for 元婴 to explain it to the owner: value, source, window, and (where relevant) aggregation mode.  
**Applied to steps:**  
## signals row for steps must include in context:  
* source: which HealthConnect source ("fit" | "watch" | "phone" | "merged")  
* window_start, window_end  
* aggregation: "sum" | "max" | "latest"  
* raw_value (before aggregation, if aggregating)  
## Diagnostic for P1-23 will confirm which of these is currently missing.  
##   
## 4. Response template  
```
text
[State what I see]
  "我这边收到的 steps 是 2700，来源 [X]，时间 [Y]。"

[State what I cannot see]
  "我看不到 Fit 的原始数据。"

[Propose one direction]
  "可能是 HealthConnect 读的数据源不对。要看我这边的源列表吗?"

```
## Not:  
* Not a numbered menu  
* Not "你确认一下..."  
* Not "要我帮你看哪一步?"  
##   
## 5. Acceptance  
* □ core/voice.md has "When something is wrong" section  
* □ Collector logs source, window_start, window_end, aggregation in steps signal context  
* □ When owner reports discrepancy, 元婴 queries signals first  
* □ Response follows §4 template  
* □ No menu-style responses for diagnostic questions  
## 6. Tracking  
```
markdown
### [P1-36] 元婴 self-diagnostic response
- Status: To Do
- Category: Bug (voice) + Feature (provenance)
- Refs: ES-011

```
**End of ES-011.**  
```
text
---

# ES-012 — Notes: Language, Tags, Feedback Loop

`docs/specs/ES-012-notes-enhancement.md`

```markdown
# ES-012 — Notes: Language, Tags, Feedback Loop

**Status**: Approved
**Category**: Bug (language) + Feature (tags, feedback loop)
**Refines**: ES-002, ES-008 §2.3
**Tracking**: P1-37, P1-38, P1-39

---

## 1. Language on web — bug

**Report**: Note text language does not work on web (PWA).

**Symptom (to be confirmed by dev)**: IME/input method fails to
compose non-ASCII text, or characters appear incorrectly, or the
textarea does not accept CJK input.

**Diagnostic required before fix:**
- Which browser? (Chrome Android, Safari iOS, desktop Chrome?)
- Which language? (Chinese, Japanese, Korean?)
- Steps to reproduce
- Screenshot of the broken input

**Likely causes** (ranked):
1. `inputMode` or `autoComplete` attribute misconfigured
2. Font family missing CJK glyphs (rendering, not input)
3. React controlled input swallowing composition events
4. PWA standalone mode conflicting with IME

**Fix depends on diagnosis.** Add reproduction to TRACKING before
proposing a fix.

---

## 2. Tags — auto-derived, visible, editable, never required

**Reconciles earlier tension.** ES-008 §2.3 says user never
categorizes. This ES clarifies: user never *must* categorize. 元婴
auto-tags, tags are visible, user may edit if they want.

**Design:**

- On save, 元婴 extracts 1–3 topic tags from the text
- Tags visible below the note, small, stone-toned
- User can add or remove tags by tapping the tag area
- Empty tags are fine — no prompt to fill
- Tags used for retrieval in History search and in 元婴 recall

**Tag vocabulary:**
- Open, not fixed. 元婴 picks words from the note itself and from
  existing tags in the owner's history.
- No fixed taxonomy. No dropdowns. No required list.
- Common tags emerge organically: "work", "提案", "sleep", "family",
  a specific project name.

**Editing:**
- Tap tag → edit inline
- Add tag: type freeform, autocomplete from prior tags
- Remove tag: tap X
- Edits are user actions, not required

**Not:**
- Not a required field
- Not a fixed list
- Not a tag hierarchy
- Not a project manager

---

## 3. Feedback loop — notes as feedback source

**Purpose**: reduce back-and-forth copy/paste between owner and dev.
Owner captures a bug or feature idea as a note; it flows to a
feedback inbox; owner promotes to PM doc with one tap.

**Design:**

- Any note can be marked `feedback` (a checkbox on the note edit
  screen, not required at save)
- 元婴 also auto-detects feedback-like notes (contains words like
  "bug", "should", "fix", "broken", or is written in imperative
  voice) and proposes the flag: "This looks like feedback. Mark it?"
- Marked notes appear in a **Feedback Inbox** (accessible via a small
  link on home, not a new tab)
- In the inbox, each item shows: date, text, [promote] [dismiss]
- [promote] → 元婴 drafts a PM doc entry (`docs/pm/inbox/YYYY-MM-DD.md`)
- [dismiss] → note stays, feedback flag removed

**What this is not:**
- Not auto-filing to `TRACKING.md`. That requires owner action (three-
  layer separation, AGENTS.md §3).
- Not a channel for dev to write back. Inbox is one-way: owner → dev.
- Not a replacement for PM docs. It's a pre-PM staging area.

**Flow:**

```
## Owner writes note → marks as feedback (or 元婴 proposes) → appears in Feedback Inbox → owner reviews weekly → [promote] drafts PM entry → owner edits and commits → dev reads docs/pm/inbox/  
```
text
**Why this reduces copy/paste**: the owner no longer has to relay
issues to dev in chat. Notes accumulate in 元婴. Weekly review
promotes them. Dev reads the PM inbox directly.

---

## 4. Acceptance

**Language bug:**
- [ ] Reproduction documented (browser, language, steps)
- [ ] Root cause identified
- [ ] Fix verified by owner on the same browser that failed

**Tags:**
- [ ] On note save, 1–3 tags auto-extracted
- [ ] Tags visible below note text, editable
- [ ] No required tag input
- [ ] Tag search works in History
- [ ] No fixed taxonomy in UI

**Feedback loop:**
- [ ] Feedback flag available on note edit (optional)
- [ ] 元婴 proposes flag on likely-feedback notes
- [ ] Feedback Inbox accessible from home (small link, not new tab)
- [ ] [promote] drafts `docs/pm/inbox/YYYY-MM-DD.md`
- [ ] [dismiss] removes flag
- [ ] No auto-write to TRACKING.md

## 5. Tracking

```markdown
### [P1-37] Note language bug on web
- Status: To Do
- Category: Bug
- Refs: ES-012 §1

### [P1-38] Note tags — auto-derived, visible, editable
- Status: To Do
- Category: Feature
- Refs: ES-012 §2

### [P1-39] Feedback loop — notes → PM inbox
- Status: To Do
- Category: Feature
- Refs: ES-012 §3

```
**End of ES-012.**  
```
text
---

# Handoff to dev

```
## Create these files:  
* docs/specs/ES-010-ai-session-capture.md  
* docs/specs/ES-011-self-diagnostic-response.md  
* docs/specs/ES-012-notes-enhancement.md  
## Execute today (P0):  
* P1-37 note language bug — reproduce first, log in TRACKING, then fix  
* P1-36 self-diagnostic voice — core/voice.md update + collector provenance logging  
* P1-23 steps — diagnostic logging per ES-011 §3, then fix  
## Execute this week:  
* P1-38 note tags  
* P1-39 feedback loop  
* P1-35 AI session capture (share sheet + folder)  
## Update TRACKING per each ES §10 / §5 / §6. Update AGENTS.md §5.1 with provenance rule (ES-011 §3). Do not reply in chat.  

# ES-012 — Notes: Language, Tags, Feedback Loop

**Status**: Approved
**Category**: Bug (language) + Feature (tags, feedback loop)
**Refines**: ES-002, ES-008 §2.3
**Tracking**: P1-37, P1-38, P1-39

---

## 1. Language on web — bug

**Report**: Note text language does not work on web (PWA).

**Symptom (to be confirmed by dev)**: IME/input method fails to compose
non-ASCII text, or characters appear incorrectly, or the textarea does
not accept CJK input.

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

**Reconciles earlier tension.** ES-008 §2.3 says the user never
categorizes. This ES clarifies: the user never *must* categorize. 元婴
auto-tags, tags are visible, the user may edit if they want.

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
The owner captures a bug or feature idea as a note; it flows to a
feedback inbox; the owner promotes it to a PM doc with one tap.

**Design:**

- Any note can be marked `feedback` (a checkbox on the note edit
  screen, not required at save)
- 元婴 also auto-detects feedback-like notes (contains words like
  "bug", "should", "fix", "broken", or is written in imperative voice)
  and proposes the flag: "This looks like feedback. Mark it?"
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
Owner writes note → marks as feedback (or 元婴 proposes) → appears in
Feedback Inbox → owner reviews weekly → [promote] drafts PM entry →
owner edits and commits → dev reads docs/pm/inbox/
```

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

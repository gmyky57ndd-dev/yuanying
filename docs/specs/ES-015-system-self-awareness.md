# ES-015 — System Self-Awareness & Feedback UI

**Status**: Approved
**Category**: Bug (UI) + Feature (AI Self-Awareness)
**Tracking**: P1-43

## 1. Create `core/system-manifest.md`

Create a file that maps the app's features. Inject this into
`buildSystemPrompt()`.

```markdown
# System Manifest
How your body (the app) works.

- **Notes:** Users can write text or use voice.
- **Tags:** You auto-generate tags for notes.
- **Feedback:**
  - To mark a note as feedback, the user must tap the note and select
    "Mark as Feedback".
  - Once marked, it appears in the "反馈" (Feedback) tab in the top right.
  - In the Feedback tab, there are buttons for "Copy for Dev" and
    "Copy for AI".
- **History:** Shows past days.
- **Settings:** Where to configure reminders.
```

## 2. Update Prompt

Modify `lib/yuanying.ts` to append `core/system-manifest.md` to the context.
Now, if the user asks "how do I mark a note as feedback?", the AI reads the
manifest and replies: "点击笔记，选择「标记为反馈」。"

## 3. Fix the UI (P1-43)

- Add the **[标记为反馈]** toggle in the Note UI.
- Add the **[Copy for Dev]** and **[Copy for AI]** buttons to the Feedback Tab.

## Acceptance

- [ ] User can mark a note as feedback in the UI.
- [ ] User can see the copy buttons.
- [ ] AI knows the exact steps to mark feedback when asked.

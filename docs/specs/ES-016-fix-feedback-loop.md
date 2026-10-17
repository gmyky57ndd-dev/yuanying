# ES-016 — Fix Feedback Loop & AI Self-Awareness

**Status**: Approved
**Category**: Bug (Missing Integration) + Feature (AI Manifest)
**Refs**: ES-014, ES-015
**Tracking**: P1-45

## 1. The Missing Webhook (GitHub)

**Problem:** The UI has a "Copy for Dev" button, but the actual GitHub API
integration is missing.

**Fix:** Ensure `/api/integrations/github` exists. When the user clicks
"Push to Dev", it should create an actual GitHub Issue (if `GITHUB_TOKEN` is
set). If the token is not set, it falls back to copying to clipboard.

**Note:** The button should be renamed from "Copy for Dev" to "Push to Dev".

## 2. The Missing Manifest (AI Self-Awareness)

**Problem:** Yuanying doesn't know about the "Save to Inbox" button or how the
UI works.

**Fix:** Create `core/system-manifest.md` and load it into
`buildSystemPrompt()`.

Draft `core/system-manifest.md`:

```markdown
# System Manifest: The UI Body

You are an AI residing inside a PWA. Here is how the user interacts with you:

## Navigation
- **首页 (Home):** The main chat and today's timeline.
- **历史 (History):** Past summaries and logs.
- **反馈 (Feedback):** The Feedback Inbox.
- **设置 (Settings):** Reminders and toggles.

## Note Actions
When a user taps a note, they see:
- **[标记为反馈]**: Marks the note so it appears in the Feedback Tab.
- **[Save to Inbox]**: Saves the note directly to `docs/pm/inbox/` for Dev to review.
- **[Push to Dev]**: Creates a GitHub issue (falls back to clipboard).
- **[Copy for AI]**: Copies a conversational block to the clipboard for external AI design partners.

If a user asks "how do I send this to dev?", tell them to tap the note and use these buttons.
```

## Acceptance

- [ ] `/api/integrations/github` creates an issue when `GITHUB_TOKEN` is set.
- [ ] "Push to Dev" creates an issue; falls back to clipboard when unset.
- [ ] `core/system-manifest.md` is loaded into `buildSystemPrompt()`.
- [ ] 元婴 can explain the note actions (including Save to Inbox).

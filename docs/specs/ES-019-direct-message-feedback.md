# ES-019 — Direct Message Feedback (Message Actions)

**Status**: Approved
**Category**: Feature (UI/UX + Integration)
**Refs**: ES-014, ES-017
**Tracking**: P1-47

## 1. The Problem

To send an AI response to Dev, the user must copy the chat text, create a new
note, paste it, and click "Push to GitHub". The chat message *is* the feedback.

## 2. The Solution

Add a context menu to all `assistant` message bubbles in the Chat UI.

### UI
- Desktop: hover → `⋮` icon on the right.
- Mobile: long-press → action menu.
- Items: **Push to GitHub** (`POST /api/integrations/github`),
  **Save to Inbox** (GitHub Contents API), **Copy** (clipboard).

### Data model
- When pushed, store `github_issue_url` (and number) on the `messages` row.
- Show an **Issue #N** badge/link under the message once pushed.

## 3. AI Awareness

`core/system-manifest.md` gains a **Chat Actions** section: tell the user to
use the `⋮` button instead of copying bug reports manually.

## 4. Acceptance

- [ ] Trigger GitHub issue creation from a chat message.
- [ ] Save a chat message to the Inbox.
- [ ] Visual indicator appears once pushed.
- [ ] Manifest updated so 元婴 knows the feature.

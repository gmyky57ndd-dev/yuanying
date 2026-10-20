# ES-032 — Yuanying Capability Expansion (Tools & Nudges)

**Status**: Approved (Priority: Medium, schedule after Phase C UI)
**Category**: Feature (Tooling & Background Tasks)
**Tracking**: P2-16
**Refs**: ES-021, ES-022, ES-030, Issue #16

## 1. The Goal

Expand Yuanying's agentic capabilities by borrowing proven mechanisms from
leading AI companions (Meli, Muse, Paradot) while strictly maintaining the
"Confirm before action" boundary.

## 2. New Tools to Implement

### 2.1 The Commitment Tracker (Inspired by Meli)

- **Tool**: `create_commitment(task_description, due_date)`
- **Mechanism**: Saves to a `commitments` table. A background cron job checks
  daily and uses `push_notification` to nudge the user.
- **Boundary**: Yuanying can nudge once per day. If ignored, it logs the miss
  and drops it.
- **Required files**: `supabase/migrations/*_commitments.sql`,
  `app/api/chat/route.ts` (tool), `lib/reminder-scheduler.ts` or a new
  `lib/commitments.ts`, and the collector notification path.
- **Acceptance behavior**: a due commitment produces at most one notification
  per day; ignoring it records a miss and stops further nudges.

### 2.2 The Safe Delegator (Inspired by Muse)

- **Tool**: `draft_communication(type, recipient, body)`
- **Mechanism**: Creates an email/message draft in Supabase. Renders a
  [Send] / [Edit] button in the chat UI. Actual sending requires an explicit
  user tap.
- **Required files**: `supabase/migrations/*_drafts.sql`,
  `app/api/chat/route.ts` (tool), `app/api/drafts/route.ts` (list/update),
  `app/api/drafts/[id]/send/route.ts` (explicit send), and chat draft UI.
- **Boundary**: drafting is allowed; sending is a separate confirmed action.

### 2.3 Deep Memory (Inspired by Paradot/Talorys)

- **Tool**: `semantic_search(query)`
- **Mechanism**: Upgrade `get_conversation_records` to use Supabase
  `pgvector` embeddings once the memory size > 50k tokens.
- **Dependency**: Requires an embedding model (e.g., OpenAI
  `text-embedding-3-small`) and a vector column/index.
- **Fallback**: below the threshold, keep the current keyword search.

### 2.4 The External Reader (Issue #16)

- **Tool**: `fetch_external_doc(url_or_file_id)`
- **Mechanism**: Fetches Google Drive text (via ES-030) or raw web pages.
- **Boundary**: read-only; do not send the fetched content to any external
  service except the configured model.

## 3. Acceptance

- [ ] Yuanying can nudge the user on a pending commitment exactly once.
- [ ] Yuanying can draft an email, and the user can send it with one click.
- [ ] Yuanying can execute `semantic_search` across imported long documents.

## 4. Non-goals

- No autonomous sending, payments, or destructive actions.
- No new capture surfaces; draft/nudge UI rides on the existing chat.

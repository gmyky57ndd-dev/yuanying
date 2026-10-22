# ES-062 — Cross-Client Chat Sync (Multi-Device)

- **Status:** Urgent Bug (P0). **Tracking:** P2-39. Refs: #75, ES-041, ES-042.
- **Symptom:** conversations held on the phone were invisible on the Mac/PWA, and
  元婴's `get_conversation_records` could not find them.

## 1. What the code actually did

| Path | Behaviour | Verdict |
|---|---|---|
| `/api/history` | selects `messages` with **no** session/device filter | correct |
| `/api/chat` context | last 20 `messages`, no filter | correct |
| `<PWA>` mount | fetches `/api/history?today=1`, no localStorage cache | correct |
| `get_conversation_records` | searched **only** `core/memory/conversations/*.md` and `docs/specs/*.md` | **broken** |

So the database was never partitioned per device: the AI simply had no tool that
read the `messages` table. That is why the owner saw "no sync": the AI could not
recall, and its answer implied the data was missing.

A secondary problem: the client generated a **new `session_id` per page load**
(127 distinct ids for 534 messages). Reads ignored it, but it made the table look
partitioned and complicated debugging.

## 2. Fixes

1. **`get_conversation_records` reads the database**: the newest 2000 `messages`
   rows (owner-wide), keyword filter in code (case-insensitive), returns
   `{source:'chat', role, at, snippet}` for up to 6 matches, then appends file
   matches. `keyword` is now optional — without it the tool returns the most
   recent messages.
2. **`/api/history` returns `created_at`** so clients can merge/sort by time.
3. **Stable device session id** (`localStorage.yy_session_id`): one id per
   device, never per page load. It is *not* used for reads; it only groups a
   device's messages when debugging.
4. Manifest/prompt: 元婴 is told history is owner-wide and that it must call the
   tool for "what did I say on my phone" questions.
5. **Device labels**: the client sends a coarse `device` (Android / iOS / Mac /
   Web, from the UA) with each message; it is stored in
   `messages.metadata.device` and returned by the tool, so 元婴 can say
   "you said this on your phone" instead of guessing. No fingerprint, no id.

## 3. Why no `owner_id` filter

元婴 is single-owner; `messages` has no owner column, and adding one would create
a second source of truth for identity. The product rule is: **every read is
owner-wide**. If multi-user ever arrives, that is a separate schema/migration
project (and a different product).

## 4. Real-time (ES-042)

Supabase Realtime is not used for chat. The Mac sees new messages on mount, on
returning to the foreground, and after sending (existing behaviour). Push-style
live updates are out of scope here; polling is unnecessary because a second
device usually reloads the page.

## 5. Acceptance

- [ ] A message sent on the phone appears on the Mac after a refresh.
- [ ] "What did I just say on my phone?" → 元婴 calls
      `get_conversation_records` and quotes the actual messages with times.
- [ ] `messages.session_id` is stable per device (no new id per page load).
- [ ] Reads never filter by `session_id` / device.

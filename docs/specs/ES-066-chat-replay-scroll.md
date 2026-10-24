# ES-066 — Chat History Replay & Scroll Stability

- **Status:** Bug fix (#80, #77). **Tracking:** P2-42.
- **Symptom:** every refresh/new message redrew the whole screen, scrolled it, and
  yesterday's messages appeared in today's view.

## Root causes

1. **SSE connected before history loaded.** The stream used `after=0` on first
   connect, so it replayed the entire `messages` table into the today-only view.
2. **The scroll effect depended on the `messages` array identity.** The 60 s
   history poll always produced a new array, so `bottomRef.scrollIntoView()` fired
   every minute even with no new message.
3. **`loadMessages` replaced state unconditionally**, forcing a full re-render on
   identical data.

## Fixes

- The realtime effect is gated on `historyReady` (set after the first history
  load); it only connects with the real last id, and reconnects after that.
- Auto-scroll only when the message count grows.
- `loadMessages` compares ids + content and keeps the previous array when equal.
- Event entries carry `source`, so reminder receipts render as `· 提醒回执`.

## Acceptance

- [ ] A refresh does not show messages older than the product day.
- [ ] Incoming messages append without the page jumping.
- [ ] A 60 s poll with no changes does not re-render or scroll.

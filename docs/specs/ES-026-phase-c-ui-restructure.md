# ES-026 — Phase C: UI/UX Restructure

**Status**: Approved
**Category**: Feature (UI/UX)
**Tracking**: P2-06 through P2-10
**Refs**: ES-007, ES-008, ES-018, ES-023, ES-025

> **Tracking note**: the handoff requested P2-01 through P2-05, but those IDs are
> already the Opinions items in `TRACKING.md`. Phase C is recorded as
> **P2-06 through P2-10** to avoid overwriting unrelated work.

## 1. Goal

Separate **Today's action** (Home) from **past memory** (History), reduce
density, and surface the Fenshen/tool capabilities without adding new capture
surfaces.

## 2. Home (Today only)

File: `app/page.tsx`.

- No historical data and no "yesterday" toggle; chat and signals are already
  scoped to the product day.
- Top section:
  - Active Fenshen avatar/name from `GET /api/fenshen`. Tapping the avatar
    opens `/settings`.
  - Fallback when the Fenshen fetch fails or has no avatar: `/avatar.png` and
    the name 元婴.
  - The five core habits (wake, sleep, water, standup, vitamin) render in one
    compact grid: `components/HabitGrid.tsx`. Tapping logs the same signal as
    before; this is not a new capture surface.
- Steps line: keeps the ES-025 debug modal on tap/long-press.
- Activity stream: today only, notes expand inline, app usage stays grouped
  into sessions.
- Chat: today only, with the existing input and mic button.

## 3. History (Memory)

Files: `app/history/page.tsx`, `app/api/history/days/route.ts`,
`app/api/history/day/route.ts`.

- List view: `date · 喝水 n/6 · 起身 n/8 · 步 n`. The day aggregation now
  includes `standup`.
- Detail view:
  - Numeric summary (wake/sleep/water/standup/vitamin).
  - **对话摘要** from the stored summary's `conversations` excerpts (the
    closest persisted prose; there is no separate AI prose-summary column).
  - **笔记** shows every note's full text and tags.
  - **活动** remains the raw chronological stream.
  - **对话** remains that day's chat log.
- The detail view is read-only. No editing/deleting from History.

## 4. Chat Actions and Loading States

File: `app/page.tsx`.

- Every assistant message keeps the `⋮` menu (hover/long-press):
  - **Push to GitHub** — uses `POST /api/integrations/github` (the same shared
    logic as the `push_to_dev` tool). Shows a spinner while in flight, then
    the existing `Issue #N` link after reload.
  - **Save to Inbox** — uses `POST /api/integrations/inbox`. The message's
    `metadata.inbox_path` is persisted, and the chat shows a **Saved to
    Inbox** badge after reload.
  - **Copy** — clipboard only.
- While a message is in flight, the chat shows a status bubble with a spinner
  and a context-aware hint (notes / past decisions / today's data). This is a
  client-side intent hint, not a server-emitted tool trace; a true streaming
  trace is out of scope for this pass.
- Failures keep the existing alerts and do not show a success badge.

## 5. Visual Rules

File: `app/globals.css` + the pages above.

- Stone palette with the existing green accent for active states.
- Low density: the five habits are one row; the activity stream stays compact.
- Subtle `fade-in` for chat messages.
- Soft `breathe` animation on the Fenshen avatar; disabled under
  `prefers-reduced-motion`.
- Feedback status badges remain the ES-023 colored badges.

## 6. Fallback Behavior

- `/api/fenshen` fails → show `/avatar.png` and 元婴; the avatar link still
  opens Settings.
- No steps today → hide the steps line (existing behavior).
- No activity/notes/chat → existing empty states remain.
- Save to Inbox fails → no inbox badge; show the API error.
- Push to GitHub fails → no issue badge; show the API error.
- No `metadata.inbox_path` → no Saved badge (older messages).

## 7. Out of Scope

- Custom Lottie/VRM avatars, theming, laptop companion.
- A server-sent event stream for real tool-call traces.
- Changing tool backend logic or adding capture surfaces.

## 8. Acceptance

- [ ] Home shows today only; empty state when there is no activity.
- [ ] History shows past days and opens full details on tap.
- [ ] Notes expand inline on Home and show full text in History.
- [ ] Chat has the `⋮` menu for Push to GitHub / Save to Inbox / Copy.
- [ ] Chat shows a loading state while a tool-requiring message is in flight.
- [ ] Feedback status badges are visible.
- [ ] No new capture surfaces.
- [ ] `tsc`, lint, and build pass; production deployment verified.

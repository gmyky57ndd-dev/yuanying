# ES-049 — Desktop PWA Layout (Responsive Fix)

**Status**: Approved
**Category**: UI/UX (CSS / Responsive)
**Tracking**: P3-02

## 1. Problem

The installed Mac PWA simply stretched the phone layout: text lines spanned the
whole window and the chat/controls were poorly balanced.

## 2. Desktop layout

- Root content is constrained to `max-w-6xl mx-auto`.
- At `md:` and above, a two-column grid:
  - **Left sidebar (280px)**: avatar/status, hold-to-talk, voice toggle,
    History/Feedback/Settings links, vertical habit buttons, steps, quick note
    actions, today's activity stream.
  - **Main column**: chat messages + input, capped at **700px** and centered.
- Mobile keeps the existing single-column flow and 60vh `AvatarStage`; the
  desktop layout hides that stage and uses a compact sidebar header instead.
- Chat text increases to `md:text-base` with relaxed line height.
- The `中/EN` toggle is hidden on desktop (mobile-only) to reduce clutter.
- Activity stream gets a taller desktop scroll area; the sidebar scrolls
  independently while the chat column stays fixed-width.

## 3. Files

- `app/page.tsx` — responsive grid, sidebar/main split, desktop header.
- `components/HabitGrid.tsx` — vertical habit list on desktop.
- `app/globals.css` — existing stage/animations unchanged.

## 4. Acceptance

- [x] Desktop content is centered with a fixed max width.
- [x] Left sidebar has habits/steps/history/settings; chat is on the right.
- [x] Chat text is larger and easier to read.
- [x] Language toggle is hidden on desktop.
- [ ] Owner visual check in the Mac PWA.

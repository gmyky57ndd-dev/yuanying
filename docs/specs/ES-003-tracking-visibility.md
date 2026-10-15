# ES-003 — Tracking Visibility (Automatic, Manual, and Reminder Activity)

**Status:** Draft — pending owner approval  
**Category:** Feature  
**Tracking:** Proposed P1-14 — confirm assignment in `TRACKING.md` before approval  
**Depends on:** B-16 (In Review; owner timezone verification pending), resolution of the button/summary inconsistency (proposed B-17 in the supplied PM handoff; current `TRACKING.md` B-17 is a different backlog item)

---

## 1. Goal

Make it clear on the home screen what 元婴 records automatically, what the owner logs manually, and which reminders were shown or acted on. The view should explain the existing data flow without turning the home screen into an analytics dashboard.

This spec also depends on a separately tracked fix ensuring button state and summary data agree. It does not silently absorb that bug fix under a conflicting tracking ID.

**Deferred:** full visual redesign, avatar integration, theming, animation polish, and onboarding. The referenced PM decision document should be located and approved before relying on it; it was not present in the repository at draft time.

## 2. Current context

The home screen currently shows wake/sleep/water controls, a steps line, and chat. A daily summary API already exists at `GET /api/summary/today`; summary generation is implemented by P1-11. The summary includes wake, sleep, water, steps, reminder counts, top apps, and total signals. The current summary does not provide every display detail in the mockup, so only values supported by the existing schema or an approved extension may be shown.

## 3. Proposed panel

Place a compact, collapsible “今天” transparency panel below the existing controls/steps area. Group supported rows as:

- **自动记录:** steps; app usage as a count or other privacy-approved aggregate. Do not show app names in this panel unless separately approved.
- **手动记录:** wake/sleep state and water count/target.
- **提醒:** count shown and count acted for water, standup, and vitamin, using summary data.

Tapping a row opens chat with a concise, prefilled question about that row. The owner can edit or cancel before sending. Do not trigger an automatic model call merely by expanding the panel or tapping a row unless the owner explicitly sends the question.

This is a transparency panel, not a dashboard: no charts, streaks, engagement metrics, or unrelated historical analytics. Reuse the existing visual palette and layout patterns.

## 4. Data and behavior

- Read from `GET /api/summary/today`; do not recompute daily totals independently in the browser.
- All displayed values must reflect the summary's configured product day and should state the date/day when useful.
- Show unavailable or missing values as unavailable; do not substitute zero unless zero is confirmed by the summary.
- Ensure button state and summary values agree. Track and close the button/summary inconsistency separately before treating this spec as complete.
- Reminder display distinguishes shown from acted; do not label a reminder “ignored” unless that state is explicitly recorded.
- Keep the panel usable on phone-sized screens and accessible to screen readers and keyboard navigation.

## 5. Acceptance criteria

- [ ] Panel displays the three categories with values supported by the current summary contract.
- [ ] Automatic data shows today's value only; app-specific detail is not exposed without approval.
- [ ] Manual entries show the appropriate current state/count and target where available.
- [ ] Reminder rows accurately distinguish shown and acted counts.
- [ ] Panel can be collapsed and expanded without causing background model calls.
- [ ] Tapping a row opens a prefilled, editable chat question; sending remains an explicit owner action.
- [ ] Button state and summary data agree after the separately tracked inconsistency fix.
- [ ] Missing data is represented honestly and does not appear as a confirmed zero.
- [ ] Layout works at phone widths and meets basic keyboard/screen-reader accessibility.
- [ ] Product-day boundaries use the shared timezone utilities and are covered by available tests.

## 6. Approval questions

1. Confirm the intended placement and whether the panel is collapsed by default.
2. Approve showing only an app-usage count (no app names) for privacy.
3. Confirm the desired prefilled questions and that send remains explicit.
4. Resolve the button/summary defect's tracking ID: the supplied handoff calls it B-17, but current B-17 is summaries retention/pruning.
5. Confirm P1-14 assignment and locate the PM document that defines the deferred redesign, if that decision remains current.

## 7. Non-goals

Do not redesign the home screen, add charts or engagement metrics, introduce new signals, expose app-level details without approval, or duplicate summary calculations in the client.

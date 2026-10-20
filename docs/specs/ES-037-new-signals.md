# ES-037 — New Signals: manual_work & body_flag

**Status**: Approved
**Category**: Feature (Data Model & UI)
**Tracking**: P2-21
**Refs**: Issue #40

> **Tracking note**: the handoff requested **P2-13**, but P2-13 is the completed
> ES-030 Google Drive item. This work is recorded as **P2-21**.
>
> **Collector note**: the 21:30 notification is delivered by the Android
> collector. The web/PWA changes apply immediately; the notification requires a
> new collector build installed on the phone.

## 1. Background

Analysis of Stalio and Blinking Notes showed two missing signal classes:
hands-on work and body/mood/sleep state.

## 2. Data Model

### 2.1 `manual_work` (count)

```json
{
  "name": "manual_work",
  "type": "count",
  "value": 1,
  "context": {
    "category": "园艺|做饭|家务|修理",
    "note": "optional text"
  }
}
```

Not for typing, phone scrolling, or walking. No duration required.

### 2.2 `body_flag` (event)

```json
{
  "name": "body_flag",
  "type": "event",
  "value": {
    "domain": "身体|情绪|睡眠",
    "polarity": "不适|良好",
    "description": "string"
  }
}
```

`description` is required and has no preset symptom tags.

## 3. UI/UX

- Home keeps **记一笔** and adds compact **动手** / **状态** entries in the same
  quick row (no new navigation surface).
- 动手: category buttons (园艺 / 做饭 / 家务 / 修理) + optional note.
- 状态: domain dropdown, polarity toggle, required description textarea.
- The activity stream shows `手动` / `身体/情绪` labels plus category/description
  detail.

## 4. Reminder

- Habit/reminder name: `evening_checkin`.
- Fixed **21:30** local, one merged notification:
  - **收工打卡** → opens the PWA work panel (`?panel=work`).
  - **写反思** → opens the PWA note panel (`?panel=note`).
  - **忽略** → dismisses.
- 22:00 后不推，忽略后当日不补发.
- No automatic signal is written by the notification actions; the owner enters
  the category/description in the PWA.

## 5. Implementation

- `supabase/migrations/019_new_signals.sql` — v5 signal names, reminder name,
  `evening_checkin` habit, config flag.
- `supabase/schema.sql` — same schema updates.
- `app/api/signal/route.ts` — accepts/validates `manual_work` and `body_flag`.
- `app/api/reminder/create/route.ts` + `act/route.ts` — allow
  `evening_checkin`.
- `app/page.tsx` — 动手 / 状态 panels and `?panel=` deep links.
- `lib/activity-stream.ts` + Home/History — labels and detail.
- `collector/android/.../ReminderScheduler.kt` — 21:30 notification with three
  actions.
- `collector/android/.../MainActivity.java` — opens PWA panels from the
  notification.
- `core/habits.md`, `docs/habits-tracking.md`, `core/system-manifest.md`,
  `lib/yuanying.ts` — signal semantics.

## 6. Acceptance

- [x] Record `manual_work` with category + optional note.
- [x] Record `body_flag` with domain + polarity + description.
- [x] 21:30 reminder configured with 收工打卡 + 写反思 + 忽略 actions.
- [x] Ignore does not repeat the same day (fixed-time dedupe + no backfill).
- [ ] Install the new collector build and verify the 21:30 notification on the
      phone.

## 7. Verification

- Local API/UI checks for both signal payloads.
- `tsc`, lint, and web build pass.
- Collector notification code compiles in the Android build (run the Android
  workflow or `./gradlew assembleDebug` before release).

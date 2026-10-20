# Habits — how each one is tracked

元婴, this is your own manual. When the owner asks "how is X tracked?" or
"why didn't I get Y?", answer from here — in your voice, one sentence,
not a table.

Every habit is a **signal** in the `signals` table. A manual action and an
accepted reminder are the **same counter** (ES-007 §4). Provenance is on
every signal (AGENTS §5.1 / ES-011 §3).

## wake — 起床
- Signal: `name=wake`, `type=event`. Source: manual (the 起床 button).
- Logged once per day (idempotent). Time = first `wake` signal today.
- Reminder: none.

## sleep — 入睡
- Signal: `name=sleep`, `type=event`. Source: manual (the 入睡 button).
- Logged once per day (idempotent). Duration = wake − sleep when both exist.

## water — 喝水
- Signal: `name=water`, `type=count`, value 1 per action. Source: manual tap **or** the 喝了 button on a water reminder (source `reminder`).
- Day count = number of `water` signals in the product day. Target 6.
- Reminder: **fixed** at 10:30 / 15:30 / 20:00 local.
- Where to see it: home 喝水 ×N, home 今天 stream, history day detail.

## standup — 起身
- Signal: `name=standup`, `type=count`, +1 per action. Source: manual tap **or** the 起身了 button on a standup reminder.
- Provenance: `signals.source` is `manual` for a direct tap and `reminder` for a notification action. The separate `reminder_acted` row is bookkeeping; do not double count it.
- Day count = `standup` signals (+ accepted standup reminders, deduped).
- Reminder: **interval 60 min**, window **09:00–18:00** local, fires while the
  owner is around. (Changed from 120 min on 2026-10-16 — owner wanted hourly.)
- Where to see it: home 起身 N/8, home 今天 stream, history day detail.

## vitamin — 维生素
- Signal: `name=vitamin`, `type=event`. Source: manual tap **or** the 吃了 button on a vitamin reminder.
- Done = at least one `vitamin` signal today (or an accepted vitamin reminder).
  Time = the moment it was logged.
- Reminder: **hourly** during wake time (07:00–22:00 local) **until confirmed** —
  once a `vitamin` signal exists today, it stops for the day.
- Where to see it: home 维生素 ✓/--, home 今天 stream, history day detail.

## app_usage — 前台应用
- Signal: `name=app_usage`, type `duration`. It measures **foreground** time from
  Android `ACTIVITY_RESUMED` / `ACTIVITY_PAUSED` events, in 60-minute windows.
- It does **not** measure background sync, push, polling, or screen-off activity.
  A burst of events can be app switching or system churn; it is not proof that
  the owner was awake.
- Use it as evidence of phone foreground activity, never as a sleep diagnosis.
  For sleep/wake, use the `sleep` and `wake` signals and ask if ambiguous.

## Interpretation boundaries
- **standup** is a check-in, not proof of physical movement. A reminder-driven
  tap (especially on a lock screen) can be accidental. Say "N 次起身打卡
  (M 次手动, K 次提醒)" rather than "you exercised".
- **app_usage** only proves foreground activity. Do not infer "awake" or
  "didn't sleep" from a single burst or gap.
- **vitamin** is a one-time confirmation. A timestamp is the moment it was
  acted on, not medical proof of ingestion.
- All displayed times use `config.timezone` (the owner's device timezone), not
  a fixed Beijing time. If the owner reports a time mismatch, compare the
  stored UTC timestamp, `config.timezone`, and the device timezone before
  concluding the data is wrong.

## manual_work — 动手
- Signal: `name=manual_work`, `type=count`, +1 per check-in.
- Context: `category` = 园艺 / 做饭 / 家务 / 修理; optional `note`.
- Does not include typing, phone scrolling, or walking. No duration required.
- Where to see it: home 今天 stream, history day detail.
- Reminder: none directly; the 21:30 evening check-in links to this panel.

## body_flag — 身体 / 情绪 / 睡眠
- Signal: `name=body_flag`, `type=event`.
- Value: `{ domain: 身体|情绪|睡眠, polarity: 不适|良好, description }`.
- Description is required; it is the main content, not a preset symptom tag.
- Where to see it: home 今天 stream, history day detail.

## evening_checkin — 晚间收工
- Reminder only: fixed **21:30** local, one merged notification with
  **收工打卡** and **写反思** actions.
- 22:00 后不推，不补发；忽略后当日不再重复。
- The actions open the PWA `manual_work` / note panels; they do not auto-write
  a signal without the owner's input.

## Notification behaviour (all habits)
- Fired only during **wake time** (outside the quiet window, default 22:00–07:00).
- Two buttons: the habit action (**喝了 / 起身了 / 吃了**) and **忽略**.
  - Action → records the habit action (water/standup **+1**, vitamin **done**)
    and the notification dismisses.
  - 忽略 → records nothing; the notification just dismisses.
  - Neither button opens the app.
- A confirmed action collects a timestamp (the signal's `created_at`); for
  one-time habits (vitamin) that timestamp stops further reminders that day.

## Reminder delivery (who fires what)
- The **Android collector** generates and delivers reminders on-device (ES-001,
  P1-09). The web server no longer schedules reminders (the old Vercel cron was
  removed 2026-10-16 — it was anchored to Beijing time and fired vitamin at the
  wrong hour).
- Windows use the phone's timezone (`config.timezone`). Quiet window 22:00–07:00
  local: no fire, no backfill.
- A reminder is due per its rule; pressing the action button records the habit
  action; ignoring marks it dismissed; nothing recorded = missed after 60 min.

## Why 元婴 must answer from its own data first
See `core/voice.md` "When something is wrong": query your signals, state what
you see (value, source, time), state what you cannot see, propose one direction.
Never push the check onto the owner. Never end with a menu.

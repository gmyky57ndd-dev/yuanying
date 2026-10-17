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

# ES-065 — True Automated Evening Summary (Cloud Cron + AI Push)

- **Status:** Approved (2026-10-23). **Tracking:** P2-41. Refs: #70, AGENTS §13.
- **Goal:** at 21:30 the backend generates a real prose summary of the day and
  pushes it to the device the owner is using — replacing the collector's fixed
  local `evening_checkin` text.

## 1. Trigger

- GitHub Actions `.github/workflows/daily-summary.yml`, `cron: '30 1 * * *'`
  (01:30 UTC = **21:30 EDT**; in EST it lands at 20:30 local — a known DST
  caveat, see §5), plus `workflow_dispatch` for manual runs.
- Calls `POST /api/cron/daily-summary` with `Authorization: Bearer $CRON_SECRET`.
  (`/api/cron/*` is already excluded from the ES-004 auth middleware.)
- Vercel Hobby cannot express a 21:30-local cron, which is why the trigger lives
  in GitHub Actions.

## 2. Generation

1. `getConfigTimezone()` + `getDateInTimezone()` give the product day.
2. `generateSummary({date, timezone})` loads the day's signals, notes and
   conversations.
3. One `generateText` call with `SUMMARY_TONE_RULES` produces 2–3 sentences:
   notes first, numbers as background, no lists, no health advice, ends by asking
   whether to keep it (ES-039).
4. The text is inserted into `messages` as an assistant row with
   `metadata = { type: 'daily_summary', date }`.
5. Idempotent: a second trigger for the same day returns
   `{skipped: 'already_generated'}` instead of duplicating the message.
6. `?dry=1` generates and returns the text without writing or pushing (useful for
   testing tone).

## 3. Push

- Web Push with VAPID (`web-push`), keys only on the server except the public key
  used by `pushManager.subscribe`.
- `push_subscriptions` (migration 025) stores one row per install:
  `device_id, endpoint, p256dh, auth, device`.
- `pushToActiveDevices()` targets `device_presence` rows seen in the last 5
  minutes; if no device is active it falls back to every subscription (ES-063
  §2.3).
- 404/410 responses prune the dead subscription automatically.
- Notification: title 元婴, body = summary (180-char cap), `tag: yuanying-daily`.
- Click → focus the existing window (or open `/`); the message is already in the
  chat because it was written before the push.

## 4. Client

- Settings → 晚间总结推送 → 开启：requests notification permission, subscribes
  with the VAPID public key and posts `{device_id, device, subscription}`.
- The service worker handles `push` and `notificationclick`.
- The chat already receives the new assistant message through the ES-063 realtime
  stream / 60 s poll, so opening the PWA shows it in the flow.

## 5. Known limits

- **DST:** 01:30 UTC is 21:30 EDT but 20:30 EST. Fixing this needs a second cron
  in winter or a timezone-aware trigger (GitHub cron is UTC-only).
- **Fallback:** if no device is subscribed, the summary still lands in `messages`
  and will be seen on the next open. Replacing the collector's local
  `evening_checkin` body with the generated text requires a collector change
  (it would need to fetch the cached summary); tracked as a follow-up so the
  local reminder is not silently left stale.
- **Hobby plan:** GitHub Actions schedule may be delayed a few minutes under load;
  the exact-minute guarantee is best-effort.

## 6. Acceptance

- [x] A cron trigger exists outside the app (GitHub Actions) with `CRON_SECRET`
      (manual dispatch run 39967011826 succeeded end to end).
- [x] The endpoint generates, stores and pushes a real summary: dry run produced
      the prose; the real run stored message **id 694** and reported
      `push: {sent: 0, scoped_to_active: true}` (no device subscribed yet);
      a second call returned `already_generated`.
- [x] `401` without the secret.
- [ ] Owner receives the push after enabling it in Settings.
- [ ] The summary appears in the chat stream (message 694 already does).

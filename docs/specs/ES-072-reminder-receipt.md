# ES-072 — Reminder Receipt Day Boundary

- **Status:** Bug fix (#78). **Tracking:** P2-44.
- **Symptom:** vitamin was marked done at 07:26, before the 08:18 wake.

## Findings

- The reminder was created at 11:26Z (07:26 EDT) because the vitamin habit window
  started at **07:00**; the action itself was a real notification tap
  (`reminder_acted` 5 s later).
- Nothing accepted receipts from previous days — but there was no guard either.

## Fixes

1. `/api/reminder/act` ignores an `acted` receipt whose reminder was scheduled
   before today's local midnight (`ignored: stale_reminder`) and ignores a second
   `acted` for the same reminder (`already_acted`).
2. The vitamin habit window now starts at **08:30** (migration 026), matching the
   sprint spec, so it cannot fire before a typical wake.
3. The activity stream labels reminder-sourced signals with `· 提醒回执` so the
   owner can see the signal did not come from a manual tap.
4. Historical rows are untouched (AGENTS §3): the 07:26 record stays for audit.

## Acceptance

- [ ] A reminder from yesterday cannot mark today.
- [ ] Vitamin does not fire before 08:30 unless wake already exists.
- [ ] Reminder receipts are visibly labelled.

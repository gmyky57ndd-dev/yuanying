# ES-062 — HealthConnect Permission Loss & Fresh Steps in Reminders

- **Status:** Urgent Bug (P0, #73). **Tracking:** P2-38.
- **Symptom:** the collector stayed online but wrote `245` steps while
  `collector_steps_error` held
  `HealthConnectException: SecurityException: Caller does not have permission to read data`.
  A permission-denied read was published as a normal daily total.

## 1. Evidence (2026-10-22)

| Time (UTC) | Value | Origins | Notes |
|---|---|---|---|
| 03:09–03:45 | 1532 / 1563 | 2 | last complete readings (previous local day) |
| 14:59:15 | 245 | 2 | SecurityException recorded |
| 14:59:19 | 245 | 2 | `status=ok`, error left stale |

`records=36` means the read returned some records, so the failure is **partial**
(one data origin denied), not a total denial.

## 2. Fixes

1. **Never publish a partial read as a daily total.** A read that raises
   `SecurityException` is reported as `collector_steps_status = no_permission`
   and is **not** posted; the UI/AI keep the last complete value.
2. **Partial rows are marked and ignored.** `/api/steps` stores
   `context.partial` / `context.error`; `get_steps` filters partial rows out and
   returns `partial_read: true` with an explanatory warning.
3. **Stale errors are cleared.** The heartbeat always writes
   `collector_steps_error` (empty when the read succeeds), so an old
   `SecurityException` cannot linger next to `status=ok`.
4. **The owner is told once a day** with a notification that opens the collector
   ("HealthConnect 权限被系统收回了，点这里重新授权").
5. **Recovery is automatic once permission is restored**: the collector reads
   the whole local day (`[local midnight, now]`) on every run, so the next
   successful read backfills the day and the max-snapshot rule takes over.

## 3. Standup reminder freshness (#73 part 2)

`ReminderScheduler.fire()` reads HealthConnect at fire time for `standup`,
appends "（现在 N 步）" to the reminder, and posts the same payload to
`/api/steps`. The reminder can no longer quote a stale count.

## 4. Reliability (pairs with #70)

- `BootReceiver` enqueues one collection after `BOOT_COMPLETED`, so a reboot does
  not wait for the owner to open the app.
- The foreground `SyncStreamService` (ES-054) still provides the 1–2 s refresh
  path while it is alive.

## 5. Acceptance

- [ ] With HealthConnect denied, the collector reports `no_permission`, posts no
      steps, and the UI shows the last complete value (not 245).
- [ ] Restoring permission makes the next read cover the whole day.
- [ ] A standup reminder shows the current step count.
- [ ] After a reboot, a heartbeat appears without opening the collector.

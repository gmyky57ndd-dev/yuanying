# WORK-ORDER-2026-10-14.md  
```
markdown
# Sprint v2 — Work Order (2026-10-14)

**From**: Product owner
**To**: Dev team + agents
**Follows**: `AGENTS.md`, `TRACKING.md`, `yuanying-engineering-spec-v2.md`
**Replaces**: Previous work order of the same date (2026-10-14 v1) — superseded due to misclassification. Read this version.

---

## 0. Context

Dev team's Supabase audit (2026-10-14) confirms:

- **F3 verified working** — collector running on-device ~11 hours, 161 `app_usage` rows, 11 hourly batches. WorkManager firing as designed.
- **1 confirmed bug** — `duration_min` inflated for some apps (Bilibili 513–653 min in a 60-min window). Cause: ROM-specific `queryAndAggregateUsageStats()` behavior.
- **1 unfinished migration** — `sit` still accepted by the API and appears in `signals` (historical row). This is **not a bug**. It is P0-01 not yet closed.
- **Reminder infrastructure absent** — `config` has no `reminders_enabled` row. P1-01 through P1-05 not started.

This work order replaces the earlier draft. The classification of `sit` removal has changed.

---

## 1. Classification Rules (READ FIRST)

Before doing anything, understand how this project classifies work. **Misclassification causes duplicate tracking entries, wrong PR prefixes, and wasted discussion.**

### 1.1 Three categories

| Category | Definition | PR prefix | Tracking entry |
|---|---|---|---|
| **Bug** | Behavior deviates from spec. Expected behavior is already defined. | `fix(...)` | New entry under To Do, tagged `[BUG]` |
| **Feature (planned)** | New behavior defined in spec, not yet built. | `feat(...)` | Entry already exists in TRACKING. Update status. |
| **Chore (completion)** | Planned change partially applied. Spec says X, code does Y. | `chore(...)` | Entry already exists. Update status. Do NOT create new entry. |

### 1.2 How to tell them apart

Ask these questions in order:

1. **Is the behavior violating the spec?**
   - Yes → Bug. Create a new tracking entry.
   - No → Continue.

2. **Is there already a tracking entry for this?**
   - Yes → Chore (completion). Update the existing entry. Do not duplicate.
   - No → Feature (planned). Create entry only if owner approves.

3. **Ambiguous?**
   - Stop. Ask. Do not guess.

### 1.3 Why this matters

The `sit` case is instructive:

- **Wrong approach**: "The API still accepts `sit`. That's a bug. Let me file Bug #B-XX and fix it."
- **Right approach**: "P0-01 says remove `sit`. The API still accepts it. P0-01 is incomplete. Verify completion, then close."

The wrong approach creates:
- A duplicate tracking entry (P0-01 + new bug)
- A `fix:` commit for a planned change
- Confusion about whether `sit` removal was ever decided

The right approach:
- Closes an existing item
- Uses `chore:` if any code change is needed
- Keeps history clean

### 1.4 Historical data is not a bug

When a migration removes a signal name (e.g., `sit`), **old rows in the database are audit trail, not bugs**.

- Do not delete them.
- Do not migrate them.
- Do not filter them out of dashboards unless the owner asks.
- Future analysis uses `created_at > <migration_date>` as the cutoff.

If the spec wanted data cleaned, it would say so explicitly.

---

## 2. Work Order — Priority Order

Work strictly top-to-bottom. **Do not start P1 while any P0 item is open.**

| # | Task | Category | Ref |
|---|---|---|---|
| 1 | Verify P0-01 complete (sit removal in production) | Chore (verify) | TRACKING P0-01 |
| 2 | Fix `duration_min` inflation | **Bug** | This doc §4 |
| 3 | Close P0-02 (signal button silent failure) | Bug | TRACKING P0-02 |
| 4 | Close P0-03 (signal definitions in prompt) | Bug | TRACKING P0-03 |
| 5 | Close P0-04 (fabrication fix — owner sign-off) | Verify | TRACKING P0-04 |
| 6 | P1-01 — Reminder scheduler | Feature | spec v2 §6, App A |
| 7 | P1-02 — Reminder cron endpoints | Feature | spec v2 §4.3, §6.3 |
| 8 | P1-04 — `/api/reminder/due` + `/act` | Feature | spec v2 §4.2 |
| 9 | P1-03 — Client reminder poller + TTS | Feature | spec v2 §6.2, App A.4 |
| 10 | P1-05 — Reminder settings toggle | Feature | spec v2 §6.4 |
| 11 | P1-07 — `/api/steps` | Feature | spec v2 App B.8 |
| 12 | P1-06 — HealthConnect step collection | Feature | spec v2 §7, App B |
| 13 | P1-08 — Reference reminders + steps in chat | Feature | spec v2 §6.3 |

**Definition of Done** for every item: `AGENTS.md` §6.

---

## 3. Task 1 — Verify P0-01 Complete

**Category**: Chore (verification, not new work)

**Context**: Dev audit found 1 `sit` row in `signals`. This row is historical (created before v2 migration). It is not a bug. The question is whether the v2 migration actually landed.

### 3.1 Verification steps

Run all four checks against **production**.

**Check 1 — API rejects `sit`**

```bash
curl -i -X POST <url>/api/signal \
  -H "Content-Type: application/json" \
  -d '{"name":"sit"}'

```
* **Pass**: 400 {"error":"invalid name: sit"}  
* **Fail**: any 2xx response  
**Check 2 — Schema constraint present**  
```
sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'signals'::regclass
  and conname = 'v2_signal_name';

```
* **Pass**: constraint exists, definition lists wake/sleep/water/steps/app_usage/phone_unlock/reminder_shown/reminder_acted, does **not** list sit  
* **Fail**: constraint missing, or still includes sit  
**Check 3 — Code clean**  
```
bash
grep -rn "['\"]sit['\"]" app/ lib/ components/ --include="*.ts" --include="*.tsx"

```
* **Pass**: no matches (or only false positives like visit, position — inspect them)  
* **Fail**: any literal 'sit' or "sit" in the code  
**Check 4 — UI clean**  
## Open PWA on phone. Signal buttons should be exactly: wake | sleep | water. Nothing else.  
## 3.2 Outcomes  
## All four pass → P0-01 is Done. Update TRACKING.md:  
* Move P0-01 from In Progress to Done  
* Add closure note: "Verified 2026-10-XX. No code changes needed. Historical sit row retained as audit trail."  
## Any check fails → P0-01 is not complete. Do the following chores:  
1. app/api/signal/route.ts — VALID_NAMES must be exactly ['wake','sleep','water']  
2. app/page.tsx — SIGNALS array must not contain sit  
3. Apply spec v2 §3.1 migration SQL to production Supabase  
4. npx vercel --prod  
## PR (only if code changes needed): chore(signal): complete sit removal from v2  
## Do not create a new tracking entry for this. P0-01 already exists.  
## 3.3 Historical data handling  
* Existing sit rows in signals: **retain**. Do not delete, migrate, or transform.  
* Future analyses filter using created_at > <v2 migration timestamp>.  
* Log the migration timestamp in TRACKING.md under P0-01 notes for future reference.  
##   
## 4. Task 2 — Fix duration_min Inflation (BUG)  
## Category: Bug. This is the only true bug in this work order.  
## 4.1 Reproduction  
## Run against production Supabase:  
```
sql
select value->>'name' as app,
       (value->>'duration_min')::int as minutes,
       created_at
from signals
where name = 'app_usage'
  and value->>'name' = 'Bilibili'
order by created_at desc
limit 10;

```
## Expected: all rows ≤ 60. Actual: rows show 513–653. Window length is 60 minutes. Impossible.  
## 4.2 Root cause  
## UsageStatsManager.queryAndAggregateUsageStats() + UsageStats.getTotalTimeInForeground() returns cumulative totals on OnePlus / ColorOS ROMs, not per-window deltas.  
## Evidence:  
* Distribution: min 1, avg 57, max 653  
* Some apps are correct (System Launcher = 58)  
* The inflation is app-dependent  
## 4.3 Fix — Two stages  
## Stage 1 (v1.0.5) — Defensive clamp (ship today)  
## In UsageStatsCollector.kt, after computing foreground_min:  
```
kotlin
val windowMs = now - oneHourAgo
val windowMinutes = (windowMs / 60_000).toInt()

for ((pkg, s) in stats) {
    val fgMs = s.totalTimeInForeground
    if (fgMs < MIN_FOREGROUND_MS) continue
    val rawMinutes = (fgMs / 60_000).toInt()
    // Defensive: never exceed window length
    val clampedMinutes = minOf(rawMinutes, windowMinutes)
    // ...build JSON with clampedMinutes
}

```
## This is a guard, not a fix. It prevents absurd values from reaching Supabase but does not recover correct per-window values.  
## PR: fix(android/collector): clamp app_usage duration to window length  
## Stage 2 (v1.0.6) — Correct per-window delta (ship within 2 days)  
## Replace queryAndAggregateUsageStats with raw event walking:  
```
kotlin
suspend fun collectLastHour(context: Context): JSONObject {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE)
        as UsageStatsManager
    val now = System.currentTimeMillis()
    val start = now - 60L * 60L * 1000L

    val events = usm.queryEvents(start, now)
    val event = UsageEvents.Event()

    val foregroundStart = mutableMapOf<String, Long>()
    val totalByPackage = mutableMapOf<String, Long>()

    while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val pkg = event.packageName
        val ts = event.timeStamp

        when (event.eventType) {
            UsageEvents.Event.ACTIVITY_RESUMED -> {
                foregroundStart[pkg] = ts
            }
            UsageEvents.Event.ACTIVITY_PAUSED -> {
                val s = foregroundStart.remove(pkg)
                if (s != null) {
                    totalByPackage[pkg] = (totalByPackage[pkg] ?: 0L) + (ts - s)
                }
            }
            // API < 29 fallback
            UsageEvents.Event.MOVE_TO_FOREGROUND -> {
                foregroundStart[pkg] = ts
            }
            UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                val s = foregroundStart.remove(pkg)
                if (s != null) {
                    totalByPackage[pkg] = (totalByPackage[pkg] ?: 0L) + (ts - s)
                }
            }
        }
    }

    // Close any still-open foreground intervals at `now`
    for ((pkg, s) in foregroundStart) {
        totalByPackage[pkg] = (totalByPackage[pkg] ?: 0L) + (now - s)
    }

    val apps = JSONArray()
    for ((pkg, totalMs) in totalByPackage) {
        val minutes = (totalMs / 60_000).toInt()
        if (minutes < 1) continue
        if (pkg == context.packageName) continue
        if (pkg == "com.android.systemui") continue
        apps.put(JSONObject().apply {
            put("package", pkg)
            put("name", resolveAppName(context, pkg))
            put("foreground_min", minutes)
        })
    }

    return JSONObject().apply {
        put("platform", "android")
        put("window_start", iso8601(start))
        put("window_end", iso8601(now))
        put("apps", apps)
    }
}

```
## Why queryEvents: queryUsageStats with INTERVAL_BEST returns bucketed aggregates whose boundary alignment with our 60-minute window is ROM-dependent. queryEvents gives raw events with precise timestamps; we compute exact window overlap.  
## API level note: ACTIVITY_RESUMED/ACTIVITY_PAUSED are API 29+. MOVE_TO_FOREGROUND/MOVE_TO_BACKGROUND are API 21+ and still delivered. The when block handles both.  
## PR: fix(android/collector): compute per-window app usage via queryEvents  
## 4.4 Verification  
## Deploy v1.0.6. Wait for 2 hourly batches. Re-run the reproduction query.  
* **Pass**: all rows ≤ 60  
* **Fail**: any row > 60 → investigate  
## 4.5 Existing inflated rows  
## Leave them. Log the v1.0.6 deploy timestamp in TRACKING.md under #B-15 notes as the clean data cutoff. Future analyses filter on this.  
## 4.6 Tracking entry  
## Create ### [B-15] app_usage duration_min inflation under To Do. Tag [BUG]. Assign P0 priority.  
##   
## 5. Tasks 3–5 — Close Existing Bug Entries  
## 5.1 P0-02 — Signal button silent failure  
## Already in TRACKING.md as In Progress. Verify per AGENTS.md §6:  
* Clicking any signal button produces visible feedback within 100ms  
* Failed request shows an alert or inline error  
* Idempotent signals do not duplicate  
* Refresh preserves state  
## If passing, move to In Review. Await owner sign-off. Then Done.  
## 5.2 P0-03 — Signal definitions in prompt  
## Same process. Verify, then move forward.  
## 5.3 P0-04 — Fabrication fix  
## Already in TRACKING.md as In Review. Only needs owner sign-off. Do not re-verify code — the owner already confirmed the behavior in chat.  
##   
## 6. Tasks 6–13 — Feature Implementation  
## Follow yuanying-engineering-spec-v2.md. Full details already in the spec.  
## 6.1 P1-01 through P1-04 — Reminder system  
## Files to create:  
##   
##   

| File                          | Ref             |
| ----------------------------- | --------------- |
| lib/reminder-types.ts         | spec v2 App A.1 |
| lib/reminder-scheduler.ts     | spec v2 App A.2 |
| app/api/cron/water/route.ts   | spec v2 §6.3    |
| app/api/cron/standup/route.ts | spec v2 §6.3    |
| app/api/cron/vitamin/route.ts | spec v2 §6.3    |
| app/api/reminder/due/route.ts | spec v2 §4.2    |
| app/api/reminder/act/route.ts | spec v2 §4.2    |
| components/ReminderPoller.tsx | spec v2 App A.4 |
  
vercel.json**** — timezone-critical. Vercel Cron uses UTC. Owner timezone is ****Asia/Shanghai**** (UTC+8):****  
```
json
{
  "crons": [
    { "path": "/api/cron/standup", "schedule": "0 1-10 * * *" },
    { "path": "/api/cron/water",   "schedule": "30 2,7,12 * * *" },
    { "path": "/api/cron/vitamin", "schedule": "30 0 * * *" }
  ]
}

```
## Convert:  
* 08:30 Beijing → 00:30 UTC → 30 0 * * *  
* 10:30 / 15:30 / 20:00 Beijing → 02:30 / 07:30 / 12:30 UTC → 30 2,7,12 * * *  
* 09:00–18:00 Beijing → 01:00–10:00 UTC → 0 1-10 * * *  
## Acceptance — one PR per sub-task, do not bundle:  
* **P1-01**: scheduler logic correct for all 3 reminder types  
* **P1-02**: 3 cron endpoints reject unauth, call scheduler with correct filter, vercel.json deployed  
* **P1-04**: /due returns only unshown reminders and marks them shown; /act records response  
* **P1-03**: poller mounts, polls every 5 min, TTS in Chinese, dedupes by reminder ID  
## 6.2 P1-05 — Reminder settings toggle  
* app/settings/page.tsx — 3 toggles  
* app/api/config/route.ts — verify PUT works  
* Config shape: {"water": true, "standup": true, "vitamin": true}  
## 6.3 P1-06 / P1-07 — Step collection  
* android/app/src/main/java/.../StepsCollector.kt — spec v2 App B.4  
* CollectorWorker.kt — update to call StepsCollector  
* MainActivity.kt + activity_main.xml — permission UI  
* build.gradle + AndroidManifest.xml — dependencies and permissions  
* app/api/steps/route.ts — server endpoint  
## 6.4 P1-08 — Reference in chat  
## Extend buildSystemPrompt() in lib/yuanying.ts to include:  
* Today's step count + goal  
* Today's water count vs target  
* Reminders from last 2 hours  
## Acceptance: 元婴 can answer real-data questions without fabrication.  
##   
## 7. Process Requirements (per AGENTS.md)  
## For every task:  
1. **Reproduce before fixing.** Bug fixes need a documented reproduction in the PR. Feature work needs a demo before "Done."  
2. **One task, one PR.** No bundling.  
3. **Verify before Done.** Owner runs it on device. AGENTS.md §6 checklist.  
4. **Update **TRACKING.md** at 18:00 daily.** Even if no change — say so.  
5. **Do not expand scope.** Log improvements in Backlog. Do not implement.  
6. **Stop and ask on principle conflict.** Three principles: Quiet by default / Confirm before action / File-based core.  
##   
## 8. TRACKING.md Updates Required  
## Before starting:  
* **Do not create a new entry for **sit**.** P0-01 already exists. Just verify and update its status.  
* Create ### [B-15] app_usage duration_min inflation under **To Do**, tagged [BUG], priority P0.  
* Verify P0-01 status is accurate. If it says In Progress but the API still accepts sit, that is correct (not yet done) — leave status as In Progress until checks pass.  
## During work:  
* Move each item To Do → In Progress when started  
* Move to In Review when code + deploy complete  
* Move to Done only after owner confirmation  
## After Bug B Stage 2 ships:  
* Record the deploy timestamp in B-15 notes as the clean data cutoff.  
##   
## 9. Daily Sync Agenda  
## 2026-10-15, 10:00 — first sync after this work order:  
1. P0-01 verification: did all 4 checks pass? (yes / no / partial)  
2. Bug B Stage 1: is v1.0.5 deployed with clamping?  
3. Bug B Stage 2 ETA: when will the queryEvents rewrite ship?  
4. P1-01 through P1-04: who owns which?  
5. Blockers?  
6. TRACKING.md up to date?  
##   
## 10. What NOT to Do  
## Out of scope for this work order, even if tempting:  
* Do not add an animated avatar. Static PNG is fine.  
* Do not build a settings page with more than the 3 reminder toggles.  
* Do not implement the pattern engine / learning model. P2+.  
* Do not refactor existing passing tests.  
* Do not migrate Stelio's remaining 5 habits.  
* Do not add auth, multi-user, or sharing.  
* Do not add analytics beyond TRACKING.md §Metrics.  
* Do not "improve" the 元婴's voice. It is authored.  
* **Do not reclassify unfinished migrations as bugs.** See §1.  
## If the work feels small, that is the correct amount of work. 元婴's value is not in feature count.  
##   
## End of work order. Status updates go in TRACKING.md  

# Dev Response 1014  
```
text
# RE: Sprint v2 — Reminder Architecture, Daily Scoping, Summary

**From**: Product owner
**To**: Dev team
**Date**: 2026-10-14
**Refs**: AGENTS.md v1.2, TRACKING.md, yuanying-engineering-spec-v2.md

---

## 1. Actions Required Today

- [ ] Read `AGENTS.md` v1.2. Focus on:
  - **§3** Work Classification (Bug vs Feature vs Chore) — new
  - **§5.4** Data Scoping Rules — new, mandatory
  - **§7.9** Stop at the first layer — new
  - **§7.10** Timezone blindness — new
- [ ] Update `TRACKING.md` per §3 of this doc.
- [ ] Reply in `TRACKING.md`. Do not reply in chat.

---

## 2. Decisions

### 2.1 Reminder architecture — REJECTED (a) and (b)

- **Reject (a) external cron**: only fixes trigger, not delivery. PWA foreground-only remains.
- **Reject (b) Vercel Pro**: same problem, plus cost, plus vendor lock-in.
- **Adopt**: move reminder generation **and** delivery into Android collector.
  - WorkManager fires hourly → checks reminder windows → shows notification + TTS directly.
  - No cron, no external dependency, no PWA needed open.
  - iOS: deferred to P2.

### 2.2 Data scoping — daily only, never cumulative

- All user-facing counts scoped to user's local calendar day.
- `water` across-days accumulation is a **bug** → `[B-16]`, P0.
- Use `lib/timezone.ts` + `getTodayRange(config.timezone)`. Never `toDateString()`, never `setHours(0,0,0,0)`.
- Full rule: `AGENTS.md` §5.4.

### 2.3 New work items

| ID | Description | Category |
|---|---|---|
| B-16 | water count accumulates across days | Bug |
| P1-09 | Reminder generation + delivery in Android collector | Feature |
| P1-10 | Steps display on PWA home | Feature |
| P1-11 | Daily summary v1 | Feature |

Implementation details for P1-11 → see **appendix** (separate doc).

---

## 3. TRACKING.md Updates

**Create**:
- `[B-16] water count accumulates across days` — Bug, P0
- `[P1-09] Reminder generation + delivery in Android collector` — Feature, P1
- `[P1-10] Steps display on PWA home` — Feature, P1
- `[P1-11] Daily summary v1` — Feature, P1

**Update**:
- `[P1-02] Reminder cron endpoints` → **Won't Do**. Reason: replaced by P1-09. Not blocked.
- `[P1-03] Client reminder poller` → In Progress (demoted to PWA-open fallback only).
- `[P1-01] Reminder scheduler` → In Progress (logic retained, implementation migrating to Kotlin).

**Do not**:
- Create a bug entry for `sit`. P0-01 already covers it.
- Duplicate entries. See AGENTS.md §3.

---

## 4. Priority Order

| # | Task | Priority |
|---|---|---|
| 1 | B-16 water scoping (timezone fix) | P0 |
| 2 | B-15 app_usage duration (in progress) | P0 |
| 3 | P0-01 verify sit removal | P0 |
| 4 | P0-02 / 03 / 04 close | P0 |
| 5 | P1-09 collector reminders | P1 |
| 6 | P1-10 steps display | P1 |
| 7 | P1-11 daily summary | P1 |
| 8 | P1-05 / 06 / 07 / 08 (existing) | P1 |

---

## 5. Out of Scope

- External cron (cron-job.org or similar)
- Vercel Pro upgrade
- Web Push
- iOS reminders
- Visualization
- Pattern engine
- Auto-scheduled summaries (P2)

---

## 6. First PR

`fix(signal): scope counts to user's local day`

Closes B-16. Blocks P1-11 (summary depends on correct daily counts).

---

## 7. Sync

Daily 10:00. Bring:
1. B-16 status
2. P0-01 verification result
3. P1-09 assignment
4. Blockers

---

**Appendix** (separate document): APPENDIX for 1014 response.

```
##   

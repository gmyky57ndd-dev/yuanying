# ES-025 — Steps Source Merge Logic & Debug View

**Status**: Approved
**Category**: Bug (Diagnostics) + Feature (Debug UI)
**Tracking**: P1-55
**Refs**: Issue #8, Issue #15, 元婴 feedback

> **Issue note**: the handoff mentioned "new open issue #15", but issue #15 is
> the `push_to_dev` fabricated-URL bug. The steps discussion belongs in
> issue #8; this spec answers the four questions there and closes #15
> separately with its own evidence.

## 1. Background

元婴 reported today's steps as `source: merged`,
`aggregation: max_per_origin`, with a source breakdown in the payload, while
the watch showed a value about 30 steps higher. The question is whether the
remaining gap is another double-counting bug or normal sampling delay.

Current production evidence (`signals` id 592, 2026-10-18 16:45:36 UTC):

- Displayed value: **536**
- `aggregation`: `max_per_origin`
- `raw_value`: **932**
- Window: `2026-10-18T04:00:00Z` → `2026-10-18T16:45:36Z`
- Timezone: `America/New_York`
- Sources:
  - `com.google.android.apps.fitness` — **396** steps, 18 records
  - `com.android.healthconnect.phone.j62889bd331e03f42835ea3e09e94ece3` —
    **536** steps, 35 records

No steps row in the last 200 contains more than two origins. A "6 sources"
payload may have been six raw `StepsRecord`s or a transient payload from a
different collector build; the new debug view exposes the actual array for
the row that produced the displayed value.

## 2. Answers to the Four Questions

### 2.1 What are the sources?

Sources are HealthConnect **data origins**, grouped by
`record.metadata.dataOrigin.packageName`. Each entry is
`{ package, steps, count }`:

- `steps` — sum of that origin's `StepsRecord.count` values inside the
  collection window.
- `count` — number of `StepsRecord`s read for that origin.

They are not one entry per physical device. A watch that writes through
Google Fit is counted under the Fit package; a watch with its own
HealthConnect writer appears as a separate package. The current production
row has two origins (Fit and the HealthConnect phone writer). If six origins
appear later, the debug view will list all six.

### 2.2 What does `max_per_origin` do?

`collector/android/app/src/main/java/com/orbace/yuanying/StepsCollector.kt`
groups all `StepsRecord`s by `dataOrigin.packageName`, sums each origin's
records, then takes the **maximum** of those per-origin sums:

```
originSums = records.groupBy(packageName).mapValues { sum(count) }
value      = originSums.values.max()
raw_value  = originSums.values.sum()   // audit only
```

It is not "max per device" and not "max per record". It assumes each origin
is an independent step counter; summing origins double-counts the same walk
(e.g., Fit 4054 + phone 4317 = 8371 in issue #8). Taking the max avoids that.

### 2.3 Why the ~30-step difference?

The current gap is 33 steps (watch 569 vs displayed 536). This is consistent
with sampling/sync delay, not double counting:

- The collector reads a snapshot at collection time; the watch display can
  include steps taken after the last HealthConnect sync.
- If the watch writes through Google Fit, Fit's origin is behind (396); the
  phone/Fit sync lag explains a small gap.
- If the watch has its own origin, it will appear as a separate source once
  HealthConnect receives it. Then `max_per_origin` will pick it if it is the
  highest.
- Double counting would look like the raw sum (932), which is ~363 higher,
  not 33.

We cannot prove the exact cause without the watch's own timestamps/source.
The debug view is the evidence needed: compare the watch's source entry and
its record window at the same time. The observed 33-step gap is inside the
<50-step acceptance range.

### 2.4 Expose the detail in the UI

Added a tap/long-press debug view on the home steps line. It shows the
displayed value, aggregation, raw total, collection window, timezone, and
every source (`package`, `steps`, `record count`).

## 3. Code Changes

- `app/api/steps/route.ts` — GET now returns the metadata/sources from the
  row that produced the max value:
  `sources`, `sources_count`, `source`, `aggregation`, `raw_value`,
  `window_start`, `window_end`, `timezone`, `updated_at`.
- `app/page.tsx` — steps line opens a modal on click or long-press
  (`contextmenu`); the modal renders the source table and explains
  `max_per_origin`.
- No collector change is needed for this item. The collector already sends
  `sources` (ES-011/P1-23 instrumentation).

## 4. Fallback Behavior

- Row has no `sources` (older collector) → API returns `sources: []`; the
  modal says this is an old-collector payload.
- No steps row today → API returns `steps: 0`, empty sources; the UI keeps
  the `0 / goal` line.
- The API still prefers `max_per_origin` rows, then local-timezone rows, then
  legacy rows, so old `sum` rows never override a corrected value.

## 5. Acceptance

- [ ] The four answers are posted on issue #8.
- [ ] The UI shows the per-source breakdown for the displayed steps row.
- [ ] The current gap is documented and remains within 50 steps while the
      watch and phone sync; the debug view provides the timestamps to
      distinguish sync lag from a logic bug.
- [ ] `tsc`, lint, and build pass; the production `/api/steps` response
      includes `sources`.

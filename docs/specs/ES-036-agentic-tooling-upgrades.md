# ES-036 — Agentic Tooling Upgrades (Feedback from Yuanying)

**Status**: Approved
**Category**: Bug + Feature (Tooling)
**Tracking**: P2-20
**Refs**: Issue #35

> **Tracking note**: the handoff requested **P2-12**, but P2-12 is the completed
> ES-029 model-router item. This work is recorded as **P2-20**.
>
> **Number note**: the earlier web-search/Markdown delivery is in
> `ES-036-web-search.md`. This file is the follow-up tooling-upgrade spec.

## 1. Background

元婴 reported five concrete tooling problems after handling ZIP/CSV files and
external searches. These determine whether it can work with larger datasets and
complex tasks without silently losing data.

## 2. Bug Fixes

### 2.1 ZIP multi-file reads (Fix 1)

- Problem: `routines.csv` existed and was marked readable, but its content
  never reached the model because all files were concatenated and then
  truncated as one string.
- Requirement: read each ZIP entry independently; return each file separately.
- Each file has its own truncation budget and metadata.
- Optional `entry` parameter selects one file, e.g. `entry="routines.csv"`.

### 2.2 Transparent truncation (Fix 2)

Any data reader that truncates must return metadata:

```json
{
  "data": "...",
  "meta": {
    "total_records": 14,
    "returned_records": 11,
    "truncated": true,
    "truncated_at": "2026-10-03",
    "message": "Data truncated at 20,000 characters"
  }
}
```

For ZIP, each file has its own `data` + `meta`, and the ZIP result has
`total_files` / `returned_files`.

### 2.3 Empty result vs system error (Fix 4)

All tools follow:

- Success with no data:
  `{ "success": true, "data": [], "message": "No results found" }`
- System failure:
  `{ "success": false, "error": "403 Forbidden from search provider" }`

## 3. Agentic Features

### 3.1 Push-down filtering (Feature 3)

`get_drive_doc` accepts:

- `entry` — select a ZIP entry.
- `start_date`, `end_date` — inclusive date range on a date-like column.
- `filter_column`, `filter_value` — column filter with `<`, `<=`, `>`, `>=`,
  `!=`, or exact `=` matching (e.g. `filter_column="water"`,
  `filter_value="<3"`).

Filters are applied before the preview/truncation step. `total_records` is the
matched row count; `returned_records` is the number of rows actually returned.

### 3.2 Action loop: `get_issue` (Feature 5)

New tool `get_issue(issue_number)` calls:

```text
GET /repos/{owner}/{repo}/issues/{issue_number}
GET /repos/{owner}/{repo}/issues/{issue_number}/comments?per_page=20
```

Returns state, labels, URL, body, and up to 20 comments. This lets 元婴 verify a
`push_to_dev` delivery and summarize Dev replies.

## 4. Implementation

- `lib/google-drive.ts` — per-entry ZIP results, per-file truncation metadata,
  CSV filters, empty-vs-error behavior. Full reads update the existing note in
  place; filtered/entry reads return a view (`saved:false`) without duplicate
  notes.
- `lib/drive-parsers.ts` — `parseCsvAll`, date-column detection, row dates, CSV
  filtering.
- `lib/github.ts` — `getIssue(number)` with issue + comments.
- `app/api/chat/route.ts` — updated tool definitions and standardized
  `{ success, data, meta, error }` results.
- `core/system-manifest.md` — documents filters, per-file ZIP reads, and
  `get_issue`.
- `lib/web-search.ts` — empty result is success; all-backend failure is a
  structured error naming each provider/status.

## 5. Acceptance

- [x] `routines.csv` in a ZIP is read completely when it fits the per-file
      budget.
- [x] Truncation returns accurate `total_records` / `returned_records` and
      `truncated_at`.
- [x] `web_search` all-backend failure returns `success: false` with
      provider/status details.
- [x] `get_drive_doc` supports date and column filters.
- [x] `get_issue` reads Issue #16 and summarizes its state/comments.
- [x] Deployed and verified via production chat on 2026-10-20 (owner phone
      spot-check optional).

## 6. Verified locally

- ZIP `Blinking Habit & Entries Export (CSV)`:
  - `entries.csv`: 602 rows, 50 returned, `truncated: true`,
    `truncated_at: "2026-07-26"`.
  - `routines.csv`: 16 rows, 16 returned, `truncated: false`.
- October ZIP (`stalio_export_csv_1792519528276.zip`) + `entries.csv` filter
  `2026-10-08` → `2026-10-16`: 30 matching rows, 30 returned.
- `get_issue(16)`: returned `state: closed`, label `yuanying-feedback`, body,
  and comments; the assistant summarized the Dev reply.
- Search with all backends forced to 403:
  `All web search backends failed: tavily: not configured; duckduckgo: ...403;
  jina/duckduckgo: ...403`.

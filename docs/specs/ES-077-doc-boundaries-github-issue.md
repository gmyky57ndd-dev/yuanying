# ES-077 — Document Boundaries & `get_github_issue`

- **Status:** Done (2026-11-08). **Tracking:** P2-58. Refs: ES-079, ES-036.
- **Numbering:** the morning-plan spec moved from ES-077 to **ES-081**.

## 1. Where documents live (recorded)

| Kind | Location | Rule |
| --- | --- | --- |
| Large docs / private KB | `~/yuanying/local_kb/` on the Mac | never uploaded to Supabase/Vercel/Coolify |
| Code & design specs (ES) | GitHub `docs/` (`docs/specs/INDEX.md`) | versioned in the repo |
| Communication / feedback | GitHub Issues | read with `get_github_issue` |

Recorded in `AGENTS.md` v1.14 (§5 "Where documents live") and
`core/system-manifest.md`.

## 2. `get_github_issue`

- Tool: `get_github_issue({ issue_number: integer })` → full issue details
  (title/state/labels/url/body/comments) via `lib/github.getIssue`.
- Result cap: 6000 chars (body + latest comments are useful together).
- Added to the `ai_architect` whitelist (migration 031):
  `get_github_issue`, `get_issue_status`, `read_code_file`, `read_local_file`,
  `search_local_kb`, `trigger_reindex`, `web_search`, `write_local_file`.
- `get_issue` is kept for personas that already use it; `get_issue_status` stays
  as the compact variant.

## 3. Evidence (dev :3001, 2026-11-08)

```
[fenshen] ai_architect active_tools=web_search,read_code_file,get_github_issue,
          get_issue_status,trigger_reindex,search_local_kb,read_local_file,write_local_file
```

Asked "读一下 GitHub issue 88 的正文和评论": the reply correctly quoted the
issue's four outstanding items and the owner-verification blocker — i.e. the
comments were read, not invented.

## 4. Open question

The task message ended mid-JSON (after the tool definition). If there were
additional acceptance criteria or whitelist entries, they were not received;
everything above is implemented.

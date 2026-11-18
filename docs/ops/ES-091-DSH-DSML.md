# ES-091 — DSML parsing leak + DSH GitHub collaboration

**Status:** Done (2026-11-18)

## DSML root cause

DeepSeek sometimes emits tool calls as text:

```
<｜DSML｜invoke name="run_terminal_command">
<｜DSML｜parameter name="command">node --version</｜DSML｜parameter>
...
</｜DSML｜invoke>
```

The old flow stripped markers before the textual-tool parser, so the call was
lost and only parameter text remained. Single-bar `｜DSML｜` was also not parsed
(only double-bar).

## Fix

- `lib/textual-tool-call.ts` now parses both `<｜｜DSML｜｜...>` and
  `<｜DSML｜...>`; parameters support string/number/array JSON; unclosed invoke
  blocks are handled.
- `/api/chat` runs `extractTextualToolCalls` **before** `stripToolMarkers`.
- Whitelisted textual/DSML calls execute through `runToolForModel`; terminal
  result is returned directly (exit code + stdout/stderr).
- Final guard strips any residual DSML before streaming and before DB insert.
- Unit tests: `lib/textual-tool-call.test.ts` (double-bar, single-bar, unclosed,
  command→argv).

## DSH tools

`dsh.tools_whitelist` now includes:

- `get_github_issue`
- `comment_on_issue`
- `assign_issue`

`ROLE_PERMISSIONS.dsh` already has `contents: write`, `issues: write`,
`pull_requests: write`; comments and assignment use the actor DSH App token.

`dsh.skill_prompt` now contains the handoff protocol: PR with `Fixes #n`,
`comment_on_issue` Done/NEXT, `assign_issue` to QA.

## Verified

- `run_terminal_command ["node","--version"]` with approved approval_id →
  response `v26.3.1`, no DSML.
- DSH comment on test issue #202 → `DSH tool test OK`; label switched to
  `fenshen:qa`; test issue closed after verification.
- DSH primary model cleared; global `deepseek-chat` used for deterministic test.

## Limits

- DSML calls are only executed if the tool is in the active whitelist.
- `run_terminal_command` still requires an approved `approval_id` and an
  allowlisted argv; malformed/unauthorized calls are stripped/rejected.
- DSML text is not a substitute for native tool calling; the parser is a fallback.

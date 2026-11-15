# ES-090 — Architect diligence tools

**Status:** Done (2026-11-15)
**Refs:** #180, #176

## Tools

`ai_architect` now has:

- `fetch_url_content` — public http(s) only; 15s timeout; 2MB response cap; 20k chars; returns `{url,title,text,fetched_at}`; blocks localhost/private hosts.
- `read_code_file` — existing repo reader, read-only, path-bound.

`fetch_url_content` is implemented in `lib/fetch-url.ts`; no headless browser and
no JS execution; it is a safe HTML-to-text extractor.

## Skill

`ai_architect.skill_prompt` contains:

- `## Handoff Protocol` + `## 纪律约束（铁律）` from #175
- `## 技术选型尽调 SOP` from ES-090, including the six-dimension checklist and
  "回退自研" decision rule.

## Acceptance evidence

- Playbook readback: `fetch_url_content` + `read_code_file` present; SOP present.
- Real fetch: `https://raw.githubusercontent.com/openabdev/octobroker/main/README.md`
  returned full text (20k cap).
- Architect comment on #176: https://github.com/gmyky57ndd-dev/yuanying/issues/176#issuecomment-6899635763
  with the six-dimension table and a self-build conclusion.

## Note

DeepSeek sometimes emits textual `DSML` tool calls when a prompt combines
multi-step fetch + table + comment. A two-step session (fetch first, then table +
comment) worked. The tool itself and comment path are verified; this is a model
compliance limitation, not a tool failure.

# ES-078 — AI Architect Fenshen & Local RAG (end-to-end)

- **Status:** Implemented (2026-11-08). **Tracking:** P2-55. Refs: ES-069,
  ES-075, ES-074. Source: owner task document (2026-11-08).
- **Goal:** a professional `ai_architect` fenshen with its own prompt, a
  request-level tool whitelist, and a local-only RAG tool (`search_local_kb`).

## 1. Data & config

- Migration `029_fenshen_skills.sql`:
  `fenshen.kind` (`persona|professional`), `fenshen.tools_whitelist jsonb`
  (`null` = all, `[]` = none), `fenshen.skill_prompt`.
- Row `ai_architect` ("AI 架构师", kind `professional`) with whitelist
  `["web_search","search_local_kb","read_local_file","get_conversation_records"]`.
- Persona file `core/fenshen/ai_architect/profile.md` (D老师 / 技术雷达 / 本地 KB 红线).

**DEVIATION 1:** the task document inserts into
`fenshen(system_prompt, active)`; the table has `prompt_md` and no `active`
column (activation is `config.active_fenshen`). The prompt is stored in
`prompt_md`; `kind` replaces `active` semantics.

## 2. Local RAG

- `scripts/local_rag_server.py`: stdlib HTTP server on `127.0.0.1:8080`,
  `GET /health`, `POST /search`, keyword scoring, max 3 snippets (1500 chars).
- KB lives in `~/yuanying/local_kb/{docs,papers}`; nothing is uploaded.
- **DEVIATION 2:** raw substring matching misses normal Chinese questions, so
  the server tokenises the query and scores documents by token hits (the exact
  query still ranks first). Still keyword-only, no vectors/Docker.

## 3. Backend

- `/api/chat` accepts `fenshen_id`; unknown ids return 400. The chosen prompt
  overrides `config.active_fenshen` for that request.
- `tools` is filtered by `tools_whitelist` **before** `streamText`; the
  authoritative tool list in the prompt is generated from the same subset, and a
  permission-boundary note tells the model to refuse unlisted actions instead of
  drafting them.
- `search_local_kb` posts to the local service with a 5 s timeout. Failure is
  explicit (`success:false`), never an empty result.
- **DEVIATION 3:** when a knowledge question arrives and the local RAG health
  check fails, the route returns a deterministic failure stream and persists it
  instead of calling the model — otherwise history/context produced invented
  answers (observed in testing).
- `console.log('[fenshen] … active_tools=…')` records the exact tool list sent
  to the model.

## 4. Frontend

- Composer switcher: 小悟（默认） / AI 架构师, persisted in `localStorage`
  (`yy_fenshen`), plus an "在线" badge; the choice is sent as `fenshen_id`.

## 5. Evidence (2026-11-08, local dev :3001)

| Test | Result |
| --- | --- |
| 1. "给 dev 发 issue" as ai_architect | reply: "我没有这个权限。" |
| 2. "部署计划是什么？" with RAG up | `POST /search 200`; reply mentions **Coolify** |
| 3. same question with RAG down | `无法连接本地 RAG 服务…` (deterministic) |
| default (no fenshen_id) | `active=xiaowu whitelist=null`, all tools |

Logs: `[fenshen] ai_architect active_tools=get_conversation_records,web_search,search_local_kb,read_local_file`.

## 6. Operational note

`search_local_kb` targets `127.0.0.1:8080`, so it only works where the Python
service runs (the owner's Mac / the Coolify VPS if the service is deployed
there). On a cloud host without it, the tool returns the explicit failure — by
design.

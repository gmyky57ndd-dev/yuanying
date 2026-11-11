# ES-069 — Professional Fenshen Architecture (Skill & Tool Whitelisting)

- **Status:** Approved (Future Sprint) — owner decision, not scheduled yet.
- **Category:** Architecture (Multi-Agent). **Tracking:** P2-48. **Refs:** #85,
  ES-013 (Fenshen), ES-029 (model router), `core/opinions/professional-fenshen.md`.
- **Idea:** a *persona* fenshen answers "who is speaking"; a *professional*
  fenshen answers "who does this task". Domain capability, not personality.

## 1. Owner decisions (locked)

| # | Decision |
| --- | --- |
| 1 | **Reuse the existing profile mechanism.** No new subsystem; a professional fenshen = a prompt + a tool whitelist. |
| 2 | **Manual switching only.** No LLM auto-routing; the error cost of auto-routing is higher than a manual switch. |
| 3 | **Full memory sharing.** Same notes, summaries, conversations; the skill prompt only narrows attention. |
| 4 | **Request-level tool enforcement.** Never trust the prompt: unlisted tools must not be sent to the model at all. |
| 5 | **Model preference is optional per fenshen.** `fenshen.model_name` wins when set; otherwise `config.active_model_id`. ES-029 is the *default* router, not a hard global. |

## 2. Current state (verified 2026-11-11)

`fenshen` columns: `id, display_name, prompt_md, avatar_url, kind,
tools_whitelist, skill_prompt, model_name, created_at`.
`core/fenshen/<id>/profile.md` is appended by `loadFenshenProfile`.
`/api/chat` resolves the fenshen (request `fenshen_id`, project room, or
`config.active_fenshen`), filters the `tools` object by `tools_whitelist`, and
selects the model from `model_name` (fallback: `config.active_model_id`).
Workpad rooms (`project_fenshen_map`) decide who may reply; tools stay
per-fenshen (one-dimensional — no `(fenshen, project)` override, owner decision
2026-11-11).

## 3. Design

### 3.1 Schema (migration, forward only)

```sql
alter table fenshen add column if not exists kind text
  not null default 'persona' check (kind in ('persona', 'professional'));
alter table fenshen add column if not exists tools_whitelist jsonb;
-- null  = unrestricted (persona behaviour, backwards compatible)
-- []    = no tools at all
-- [...] = exactly these tool names
alter table fenshen add column if not exists skill_prompt text;
alter table fenshen add column if not exists model_name text; -- null = global default
```

- `skill_prompt` is appended after `prompt_md` (never replaces identity).
- Insert the first professional rows only after the owner writes their prompts.
- No data migration: existing rows keep `kind='persona'` and `tools_whitelist=null`.

### 3.2 Request-level enforcement (`app/api/chat/route.ts`)

1. After `getActiveFenshen()`, read `tools_whitelist` / `skill_prompt`.
2. Build the full `tools` object as today, then:

```ts
const allowed = activeFenshen?.tools_whitelist;
const scopedTools =
  Array.isArray(allowed)
    ? Object.fromEntries(
        Object.entries(tools).filter(([name]) => allowed.includes(name))
      )
    : tools;
```

3. Pass `scopedTools` to `streamText` — **not** the full set. The model never
   sees the definition, so it cannot attempt the call (the owner's acceptance:
   "未授权工具在请求侧不可见").
4. Forced `toolChoice` (ES-067) must be skipped when the forced tool is not in
   the whitelist; otherwise the request fails.
5. The authoritative tool-availability string in the system prompt is generated
   from the same subset, so the model's self-description matches reality.
6. `get_system_status` remains available to every fenshen (it only reads logs);
   decide per fenshen whether that is a whitelist entry or a default.

### 3.3 Memory and context

- `get_notes`, `get_summary`, `get_conversation_records` read the same tables —
  unchanged. The skill prompt may say "focus on financial data", but the data
  scope stays owner-wide (AGENTS §13).
- Do **not** add per-fenshen memory tables; that would fork the self.

### 3.4 UI

- Extend the existing fenshen switcher: group by `kind` (人格 / 专业) instead of
  adding a second switcher.
- Optional command: `/skill finance` maps to the same `PUT /api/fenshen`.
- Show the active professional fenshen in Settings + the header badge.

### 3.5 Model (decided: option B, one-dimensional)

- `getModel(fenshen.model_name ?? undefined)`: a fenshen may pin a model from
  `models`; null falls back to `config.active_model_id`.
- No `(fenshen, project)` model override (only one project in active use).
- ES-029 is the default router; per-fenshen pinning is an override.

## 4. Candidate roles (current)

| Skill | Prompt focus | Likely whitelist |
| --- | --- | --- |
| PM (拓维) | requirements, PRD, feedback triage | `get_notes`, `get_conversation_records`, `push_to_dev`, `get_github_issue`, `read_local_file`, `write_local_file`, `get_goals`, `read_project_doc` |
| Architect (阿构) | architecture review, code reading | `web_search`, `read_code_file`, `get_github_issue`, `get_conversation_records`, `read_project_doc`, `get_goals` |
| Tester | regression/acceptance | `get_notes`, `get_github_issue`, `read_code_file`, `get_conversation_records` |
| DevOps/DSH | deploy/ops diagnostics | `get_system_status`, `get_github_issue`, `read_code_file`, `push_to_dev` |
| Business | pricing/positioning | `web_search`, `get_notes`, `get_goals`, `read_project_doc` |

Old ASO/Live2D/Finance examples were placeholders; they are not active roles.

## 5. Acceptance

- [ ] A financial fenshen asked to file an issue replies "I don't have that
      permission" — and the tool was **never sent** in the request.
- [ ] Switching back to 小悟 restores every tool.
- [ ] Memory reads are identical across fenshen.
- [x] `fenshen.model_name` is used when set; null falls back to the global default
      (verified `[model] fenshen=ai_pm model=deepseek-chat`).
- [x] Tool visibility is per fenshen; room membership only decides who replies.
      No `(fenshen, project)` 2D override (owner decision).
- [ ] A persona row with `tools_whitelist = null` behaves exactly as today.

## 6. Open questions for the owner

1. `tools_whitelist = []` means "no tools" or "unrestricted"? (This spec treats
   `[]` as none and `null` as unrestricted.)
2. Should `get_system_status` be global or whitelisted per fenshen?
3. Can a fenshen have more than one skill pack (e.g. finance + ASO), or one
   fenshen per skill?

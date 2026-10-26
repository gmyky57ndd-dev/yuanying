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
| 5 | **Global model routing stays (ES-029).** A professional fenshen carries no model preference. |

## 2. Current state (verified 2026-10-26)

`fenshen` columns: `id text`, `display_name text`, `prompt_md text`,
`avatar_url text`, `created_at timestamptz`. `/api/chat` resolves the active
fenshen from `config.active_fenshen` and injects `prompt_md` into the system
prompt. The `tools` object in `app/api/chat/route.ts` is currently the same for
every persona.

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

### 3.5 Model

- `config.active_model_id` is global; switching fenshen does not change it.
- A professional fenshen may still be used with any routed model.

## 4. First candidates (owner-suggested)

| Skill | Prompt focus | Likely whitelist |
| --- | --- | --- |
| ASO | store listing, keywords, reviews | `get_notes`, `get_summary`, `web_search`, `read_markdown`, `get_issue` |
| Live2D | model/rig/asset QA | `read_markdown`, `get_drive_doc`, `get_notes`, `web_search` |
| Finance | spend, subscriptions, invoices | `get_notes`, `get_summary`, `query_external_chats` |

`push_to_dev` and `write_markdown` should be excluded from most professional
fenshen; those stay with 小悟 (operator) unless the owner decides otherwise.

## 5. Acceptance

- [ ] A financial fenshen asked to file an issue replies "I don't have that
      permission" — and the tool was **never sent** in the request.
- [ ] Switching back to 小悟 restores every tool.
- [ ] Memory reads are identical across fenshen.
- [ ] The active model does not change when switching fenshen.
- [ ] A persona row with `tools_whitelist = null` behaves exactly as today.

## 6. Open questions for the owner

1. `tools_whitelist = []` means "no tools" or "unrestricted"? (This spec treats
   `[]` as none and `null` as unrestricted.)
2. Should `get_system_status` be global or whitelisted per fenshen?
3. Can a fenshen have more than one skill pack (e.g. finance + ASO), or one
   fenshen per skill?

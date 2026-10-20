# ES-029 — Model Router & Provider Abstraction

**Status**: Approved
**Category**: Feature (Architecture)
**Tracking**: P2-12
**PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/19

> **Tracking note**: the handoff requested **P2-07**, but P2-07 is the completed
> Phase C / ES-026 history item. This work is recorded as **P2-12** in
> `TRACKING.md`.

## 1. Goal

Make 元婴 model-agnostic. The owner can add and switch between DeepSeek,
OpenAI, Anthropic, and custom OpenAI-compatible providers (OpenRouter, Ollama,
etc.) from Settings, without a code deployment. Model credentials stay
server-side.

## 2. Database Schema

File: `supabase/migrations/017_models.sql` (also mirrored in
`supabase/schema.sql`).

```sql
create table if not exists models (
  id          text primary key,
  provider    text not null,
  model_name  text not null,
  api_key     text,
  base_url    text,
  created_at  timestamptz default now()
);

insert into config (key, value)
values ('active_model_id', '"deepseek-chat"'::jsonb)
on conflict (key) do nothing;
```

The migration seeds `deepseek-chat` with the DeepSeek base URL and no stored
key, so it falls back to `DEEPSEEK_API_KEY`. The migration was applied to the
configured Supabase.

## 3. Router

File: `lib/llm-router.ts`.

`getModel(modelId?)`:

1. Uses `modelId` or reads `config.active_model_id`.
2. Loads the row from `models`.
3. Resolves the key from `models.api_key`, then the provider environment
   variable (`DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).
4. Returns the correct AI SDK model:
   - `deepseek` — `createOpenAI` with the DeepSeek-compatible base URL.
   - `openai` — `createOpenAI` (optional custom `base_url`).
   - `anthropic` — `createAnthropic` (optional custom `base_url`).
   - `custom` — `createOpenAI` with the required `base_url`.
5. Throws an explicit error when the model is missing, the key is missing, the
   base URL is missing for `custom`, or the provider is unsupported.

Dependencies: `ai@4.3.19`, `@ai-sdk/openai@1.3.24`,
`@ai-sdk/anthropic@1.2.12`, and `zod@3.25.76` (AI SDK peer).

## 4. API

### `app/api/models/route.ts`

- `GET` — list models (`id`, `provider`, `model_name`, `base_url`,
  `has_api_key`, `created_at`) plus the active id. Never returns `api_key`.
- `POST` — add a model. `id` defaults to `model_name`. Validates provider,
  `model_name`, and `base_url` for `custom`.
- `PUT` — set `active_model_id`; rejects unknown models.
- `DELETE ?id=` — delete a model; rejects deleting the active model.

### `app/api/models/test/route.ts`

`POST { id }` sends a small ping through the selected model and returns:

```json
{ "success": true, "reply": "ok" }
```

or an explicit failure:

```json
{ "success": false, "error": "missing API key for ..." }
```

## 5. Settings UI

File: `app/settings/page.tsx`.

Adds a **模型** section:

- List of saved models with provider, base URL, and whether a key is stored.
- Active model radio switch via `PUT /api/models`.
- Test button per model via `/api/models/test`.
- Add form: provider dropdown, model name, API key (password), optional base
  URL. The API key is write-only from the browser's perspective.
- The active model cannot be deleted; switch first.

## 6. Chat Integration

File: `app/api/chat/route.ts`.

The hardcoded DeepSeek `fetch` loop is replaced with AI SDK `streamText`:

- `getModel()` selects the active model.
- Existing tools (`get_notes`, `get_conversation_records`, `get_summary`,
  `push_to_dev`) are declared with `tool()` + Zod and run with `maxSteps: 3`.
- Tool failures return explicit `{ success: false, error }` results.
- The response is returned with `result.toDataStreamResponse()`.
- `onFinish` persists the user and assistant messages.
- The ES-022 `push_to_dev` failure guard is preserved when persisting.
- Model router failures return `{ success: false, error }` with HTTP 502, so
  the client alerts the owner instead of inventing a reply.

File: `lib/api.ts`.

`postChat()` consumes the AI SDK data stream with `processDataStream()` and
keeps the existing `{ reply }` contract for `app/page.tsx`. Error parts throw
so the chat UI surfaces the failure.

## 7. Acceptance

- [x] User can add a model via Settings.
- [x] User can switch the active model.
- [x] The chat API uses the active model.
- [x] Missing model, bad key, or unsupported provider returns
      `success: false` and surfaces the error.
- [x] DeepSeek continues to work through the router.
- [ ] Owner verifies the Settings form and a real chat message on the deployed
      PWA.

## 8. Verification

- `GET /api/models` returned `deepseek-chat` with `has_api_key: false`.
- `POST /api/models/test { id: "deepseek-chat" }` returned
  `{ success: true, reply: "ok" }`.
- `POST /api/chat` returned an AI SDK data stream (`0:"..."`) and persisted
  both messages; test messages were removed afterwards.
- CRUD verified: add temporary custom model → activate → active-delete guard
  → restore `deepseek-chat` → delete temporary model.
- `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass.

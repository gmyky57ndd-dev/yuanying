# Model Router — Owner & Yuanying Guide

**Feature**: ES-029
**Issue**: #20
**Status**: Implemented

## 1. What it solves

元婴 used to call one hardcoded DeepSeek endpoint. Now the chat model is a
database row, so the owner can switch providers without a deployment:

- DeepSeek
- OpenAI
- Anthropic
- Custom OpenAI-compatible providers (OpenRouter, Ollama, etc.)

## 2. Where to switch

In the PWA: **设置 → 模型**.

- Saved models show the model name, provider, base URL, and whether a key is
  stored.
- Select the radio button to make a model active.
- **测试** sends a small ping through that model.
- The active model cannot be deleted; switch to another model first.
- The selection is stored in `config.active_model_id` and persists across
  reloads/devices.

Adding a model:

- Provider: `deepseek`, `openai`, `anthropic`, or `custom`.
- Model name: the exact string sent to the provider (for example `gpt-4o`).
- API key: optional if the provider key is already in server env.
- Base URL: optional for OpenAI/Anthropic; required for `custom`.

## 3. When it takes effect

- Routing is **per request**: each new chat message reads the active model at
  that moment.
- Switching affects the **next message**, not messages already in flight.
- It is **global**, not per-Fenshen. Changing 小悟 → Kael does not change the
  model; changing the model does not change the Fenshen profile.
- Conversation history, notes, signals, summaries, and memory are unchanged.

## 4. What changes and what does not

**Can change with the model**

- Reasoning quality and style
- Context-window size
- Tool-calling reliability
- Latency and cost
- Voice consistency (a different model may imitate the authored voice less
  faithfully)

**Never changes**

- `core/identity.md`, `core/voice.md`, `core/values.md`, ground rules
- The active Fenshen profile
- Database memory (`signals`, `messages`, `summaries`)
- The available tools and their confirmation boundaries

## 5. Asking 元婴

Ask: "你现在用哪个模型？" / "Which model are you using?"

元婴 calls `get_model_info()` and answers from the database result. It never
reveals API keys. If the owner asks how to switch, 元婴 points to
**设置 → 模型**.

## 6. Failure and fallback

- Missing model row → chat returns `model not found`; nothing is fabricated.
- Missing/incorrect key → the provider error is surfaced in chat.
- Unsupported provider → explicit error.
- DeepSeek still works through the env fallback `DEEPSEEK_API_KEY` when the
  `models` row has no stored key.
- Optional env fallbacks: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.
- There is no automatic provider failover in this pass. The owner switches
  manually.

## 7. Technical notes

- Router: `lib/llm-router.ts`.
- API: `app/api/models/route.ts`, `app/api/models/test/route.ts`.
- Chat integration: `app/api/chat/route.ts` (`streamText`, `maxSteps: 3`).
- Settings UI: `app/settings/page.tsx`.
- Schema: `supabase/migrations/017_models.sql`.
- Keys are stored server-side and are never returned by `/api/models`.
- Tool: `get_model_info()` returns id/provider/model name/base URL/key
  availability.
- Spec: `docs/specs/ES-029-model-router.md`.

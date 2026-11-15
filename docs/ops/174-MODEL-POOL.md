# #174 — Per-fenshen model pool

**Status:** Done (2026-11-15) — OpenRouter live call verified.

## Model rows

| id | provider | model | base_url |
|---|---|---|---|
| deepseek-chat | deepseek | deepseek-chat | api.deepseek.com/v1 |
| deepseek-reasoner | deepseek | deepseek-reasoner | api.deepseek.com/v1 |
| openrouter-gpt-4o-mini | openrouter | openai/gpt-4o-mini | openrouter.ai/api/v1 |
| anthropic-claude-sonnet-4 | anthropic | claude-sonnet-4-20250514 | SDK default |
| openai-gpt-4o-mini | openai | gpt-4o-mini | SDK default |

`llm-router.ts` has the ADR-006 exception: only a new `case 'openrouter'` and
`apiKeyFor()` line; existing deepseek/openai/anthropic branches untouched.

## Defaults

All 7 fenshen default `primary_model = deepseek-chat`; `backup_model` empty.
Existing `model_name` is kept as the legacy primary alias.

## UI

Workpad → 成员 → 每个分身有「主模型 / 备用模型」两个下拉，写入
`/api/fenshen/config`，下一条消息生效.

## Failover

- primary probe timeout 30s; backup probe timeout 60s.
- 5xx/429/network → backup; other 4xx no fallback.
- `cost_ledger.degraded` + `fallback_reason`; actual model recorded.
- Tests in `lib/failover-policy.test.ts` cover 429, 5xx, 400, 401, 404, network.

## OpenRouter verification

`OPENROUTER_API_KEY` was added to the desktop `secrets.env`; after restarting
the Tauri sidecar `has_api_key` is true and a real call succeeded:

```text
[model] fenshen=xiaowu model=openrouter-gpt-4o-mini degraded=false
reply: 可用。
```

OpenRouter uses `structuredOutputs: false` to avoid OpenAI strict-schema
rejection of optional tool fields (e.g. `complete_action.result_ref`).

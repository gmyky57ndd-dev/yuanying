# #174 — Per-fenshen model pool

**Status:** implementation complete; OpenRouter live check blocked by missing runtime key.

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

## OpenRouter blocker

`get_model_info('openrouter-gpt-4o-mini')` returns `has_api_key: false` on this
machine. `OPENROUTER_API_KEY` is not in `.env.local` or the desktop
`secrets.env`. Owner says it is configured in the server secret; the runtime
here cannot see it. Per #174: do not bypass; configure the key in this runtime
and restart before calling OpenRouter.

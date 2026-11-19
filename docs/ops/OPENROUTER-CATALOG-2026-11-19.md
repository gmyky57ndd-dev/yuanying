# OpenRouter catalog refresh — 2026-11-19

## Failure investigated

`发送失败：Failed after 3 attempts. Last error: Provider returned error`

Root cause was **not** a general OpenRouter outage:

```text
baidu/ernie-5.5-flash-preview:free is temporarily rate-limited upstream
provider_error_code: tpm_rate_limit_exceeded
limit_source: upstream_provider_shared_pool
```

Fenshen `xiaowu` / `ai_pm` / `librarian` / `dsh` were pinned to the Baidu free
model. The request-level failover probe can pass, then the actual stream hits a
429; the current request cannot switch mid-stream. The result was an AI SDK
`AI_RetryError` after 3 retries.

## Catalog cleanup

Checked live `https://openrouter.ai/api/v1/models` (444 models).

Removed (no longer present):

- `z-ai/glm-5.2:free`
- `qwen/qwen3-coder:free`
- `minimax/minimax-m2.5:free`
- `dots-studio/dots3-note:free`
- `moonshotai/kimi-k2.6:free`

Added:

- `particle-ai/particle-1:free` (`particle-ai`, `particle-1:free`)
- `openrouter/auto` (`openrouter`, `openrouter/auto`) — generic auto-router

Kept active entries: Baidu free, NVIDIA ultra free, NVIDIA VL free,
OpenRouter GPT-4o mini, DeepSeek rows, Anthropic/OpenAI rows.

## Routing

- All fenshen model overrides cleared; global `active_model_id` is now
  `openrouter-auto`.
- Vendor router supports `particle-ai`.
- `/api/models` accepts `particle-ai`; 12 live rows.
- Free rows still show `· free（限流）`.

## Verified

```text
[model] fenshen=xiaowu model=openrouter-auto degraded=false
reply: 可用。

[model] fenshen=xiaowu model=particle-ai-particle-1-free degraded=false
reply: 可用。
```

Restored active model to `openrouter-auto`.

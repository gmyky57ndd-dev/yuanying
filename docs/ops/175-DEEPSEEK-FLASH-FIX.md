# DeepSeek flash model-name fix (2026-11-16)

## Failure

Selecting the new `deepseek-flash-1017` row produced:

```text
The supported API model names are deepseek-flash, deepseek-v4-pro,
but you passed deepseek-flash-1017.
```

## Root cause

The owner-provided slug `deepseek-flash-1017` is a **display/id**, not a valid
DeepSeek API `model` value. DeepSeek's API accepts `deepseek-flash` and
`deepseek-v4-pro`.

## Fix

- `models` row id `deepseek-flash-1017` now has `model_name = 'deepseek-flash'`.
- Added `deepseek-v4-pro` (`provider=deepseek`) as the second supported API
  model.
- Active model test: selecting `deepseek-flash-1017` returned `可用。`.
- Restored `active_model_id = deepseek-chat` after verification.

The row id is retained so existing selector/config references do not break;
only the upstream model name is corrected.

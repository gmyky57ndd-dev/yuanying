# #175 — new model list + AC2 handoff chain

**Status:** Done (2026-11-15)

## Models

Nine rows added in `supabase/migrations/056_new_model_list.sql`:

| provider | model |
|---|---|
| deepseek | deepseek-flash-1017 |
| baidu | ernie-5.5-flash-preview:free |
| z-ai | glm-5.2:free |
| nvidia | nemotron-3-ultra-550b-a55b:free |
| qwen | qwen3-coder:free |
| minimax | minimax-m2.5:free |
| dots-studio | dots3-note:free |
| nvidia | nemotron-3.5-super-vl:free |
| moonshotai | kimi-k2.6:free |

OpenRouter vendor providers build the upstream slug as `provider/model_name`.
`:free` rows show `· free（限流）` in Settings.

Verified active selection `qwen-qwen3-coder-free`:

```text
[model] fenshen=xiaowu model=qwen-qwen3-coder-free degraded=false
```

OpenRouter returned the real "unavailable for free" error; no silent fallback.
Active model restored to `deepseek-chat`.

## Global vs per-fenshen

All fenshen `model_name` / `primary_model` / `backup_model` were cleared so
Settings `active_model_id` (request-level global route) applies. Per-fenshen
overrides remain available from Workpad.

## AC2 handoff

- `assign_issue` rewrites the note by target; stale PRD/architect notes are
  replaced with the target default.
- Handoff next-hop note is generated for the target, not copied from the
  previous hop.
- Labels are atomically replaced; full-repo scan shows no issue with more than
  one `fenshen:*` label.

Evidence: #193 three-hop (PM → Architect → DSH), closed after PRD + ADR + DSH
handoff; final label only `fenshen:dsh`.

## Limits

- Free slugs are rate-limited; only actual routing/error transparency was
  verified, not every slug's current availability.
- Architect auto-handoff remains model-compliance sensitive; the AC2 test
  succeeded but can emit duplicate assignment comments.

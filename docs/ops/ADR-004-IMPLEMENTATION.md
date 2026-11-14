# ADR-004 / ADR-005 implementation — step 1

**Status:** In Progress (2026-11-14), owner approved approval #8.

## ADR-004: dynamic model routing + cost breaker

### Model routing

- `fenshen.model_name` selects a row in `models` (provider/model_name/base_url).
- `getModel(fenshen.model_name ?? undefined)` falls back to global `active_model_id`.
- No per-request UI model override; Inspector settings already expose the field.

### Cost ledger

`cost_ledger`: project_id, fenshen_id, model_id, request_id, prompt_tokens,
completion_tokens, estimated_cost, created_at.

`model_prices` seed: `deepseek-chat` $0.27 / $1.10 per 1M input/output (USD).
Prices are configurable in DB; unpriced models cost 0 (warning in docs, not blocking).

### Budgets / breaker

`projects.token_budget`, `projects.cost_budget` (0 = unlimited).

- Calendar month (UTC) spend.
- 80% → `system_events.kind=budget_warning` (once per project per 15 min) and a prompt warning.
- 100% → HTTP **429** `当前项目预算已耗尽，请老板充值或调整额度。`
- Verified: token_budget=50 → first chat allowed, recorded 13,652/2 tokens;
  second chat **429** with `tokens_used=13,654`.
- `get_project_cost` / `set_budget` tools (xiaowu).
- `/api/cost?project_id=` + Workpad 台账 budget card/editor.

### Limits

- Only the main stream usage is recorded; nested `generateText` tool calls are not.
- Pricing seed must be kept current; unknown model cost=0.
- Budget is per project/month, not per fenshen.

## ADR-005: skills + GitHub permissions

Implemented:

- `fenshen.skill_prompt` appended to the system prompt after `prompt_md`.
- Settings UI textarea + `/api/fenshen/config` PUT + `configure_fenshen` tool.
- `submit_pr`/`git_commit` still require an approved `approval_id`.

**Blocked / not implemented:**

- Per-fenshen GitHub App tokens and scope isolation (Contents / Issues / Actions).
  Requires a GitHub App installation, private key, and token broker. Current
  tools use the global `GITHUB_TOKEN`; do not claim ADR-005 §2.1 is done.
- `git_create_branch` is folded into `git_commit` (branch is created on demand).

## Next

1. Provision GitHub App + per-role token broker (owner/infra).
2. Count nested tool-generation usage.
3. Budget notifications (email/push) and per-fenshen cost breakdown UI.

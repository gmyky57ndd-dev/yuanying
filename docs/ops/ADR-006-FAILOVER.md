# ADR-006 — Primary/backup model failover

**Status:** Approved + implemented step 1 (2026-11-14).

## Decisions applied

1. Failover on first-token timeout >30s, HTTP 5xx, HTTP 429, network errors.
   **No failover on 400/401/403/404** (configuration errors must be visible).
2. No switch-back inside one request; once the request uses backup, it stays there.
3. No session lock: each message starts with the primary again (or the down-cache).
4. `cost_ledger` records the **actual** model, plus `degraded` and
   `fallback_reason`. Prices stay in `model_prices` (no `cost_per_1k`).

`tier` is intentionally not added; `primary_model` + `backup_model` are enough.

## Schema

- `fenshen.primary_model`, `fenshen.backup_model` (backfilled from `model_name`).
- `cost_ledger.degraded boolean`, `cost_ledger.fallback_reason text`.

## Implementation

`lib/model-failover.ts`:
- if a backup exists, probe the primary with a 1-token call (30s timeout);
- cache healthy primary for 60s; mark retryable failures down for 5m;
- 4xx (except 429) rethrow without fallback;
- backup selection returns `degraded=true` + reason; `recordCost` writes them.

Chat route uses `resolveModelWithFailover` before `streamText`; stream errors mark
the primary down for subsequent requests.

## Verified

Set xiaowu primary to an unreachable custom model + backup `deepseek-chat`:

```
[model] fenshen=xiaowu model=deepseek-chat degraded=true
reason=Cannot connect to API: bad port
```

Cost row recorded `degraded=true`, `fallback_reason` set. Restored xiaowu
primary/backup to null and removed the test model.

## Limits

- The probe is a health gate, not a mid-stream switch. If the primary passes the
  probe and then fails mid-stream, the current request fails; the primary is
  marked down and the **next** request uses backup. This is documented rather
  than hidden.
- Probe costs one tiny generation per primary per 60s when a backup is set.
- `model_name` remains as a legacy alias for primary.

## Handoff protocol enforcement

- `assign_issue` handoffs to PM/architect set `handoff_tool_required` and
  `toolChoice: 'required'`.
- After the stream, if `comment_on_issue` / `assign_issue` are missing, the
  route emits `Handoff Protocol Violation` and logs `handoff_violation`.
- `lib/handoff.ts` retries once with an explicit required-tool message.

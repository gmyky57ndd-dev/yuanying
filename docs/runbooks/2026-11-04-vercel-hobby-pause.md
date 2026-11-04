# Incident 2026-11-04 — Production paused: Vercel Hobby fair-use (Fluid Active CPU)

## Status

- **Impact:** every URL of the project returns **HTTP 402** with
  `x-vercel-error: DEPLOYMENT_DISABLED` ("This deployment is temporarily paused").
  The PWA cannot load; the collector's API calls fail; Web Push still delivers
  nothing new.
- **Cause:** the **team** was paused by Vercel for exceeding the Hobby fair-use
  limit on **Fluid Active CPU** (`blockedDueToOverageType: "fluidDuration"`).
  This is not a build failure: the production deployment is `READY`.
- **Owner decision:** contact Vercel support for a manual unpause (2026-11-04).
- **Automatic unpause:** 2026-12-03T19:29:53Z.

## Evidence (2026-11-04)

```
GET /v2/teams/team_pg0Busi9zTBHj49ZHlEoMcZp
softBlock: {
  "blockedAt": 1793734193014,              // 2026-11-03T19:29:53Z
  "reason": "FAIR_USE_LIMITS_EXCEEDED",
  "blockedDueToOverageType": "fluidDuration",
  "unpauseAt": 1796326193014               // 2026-12-03T19:29:53Z
}
team.billing.status: "active"   // not a payment failure
project: prj_jAu3mWXFr5WWEgSqJPB6UwuibcbE
latest deployment: dpl_CGWyavoSR37rgS4jzr9WPrhHmT5M, readyState READY
```

```
HTTP/2 402
x-vercel-error: DEPLOYMENT_DISABLED
body: Payment required / DEPLOYMENT_DISABLED
```

All three aliases (`yuanying-rust.vercel.app`, the deployment URL and the
git-main alias) return 402 → team-level block, not project/alias-specific.

## Support request (paste into https://vercel.com/help → Contact Support)

> **Subject:** Request to lift an automated Hobby fair-use pause (team `yuanying`)
>
> Hello Vercel team,
>
> My Hobby team **yuanying** (`team_pg0Busi9zTBHj49ZHlEoMcZp`, project
> `prj_jAu3mWXFr5WWEgSqJPB6UwuibcbE`, deployment
> `dpl_CGWyavoSR37rgS4jzr9WPrhHmT5M`) was paused on **2026-11-03 19:29 UTC**
> with `softBlock.reason = FAIR_USE_LIMITS_EXCEEDED` and
> `blockedDueToOverageType = fluidDuration`. The unpause date is 2026-12-03.
>
> This is a small personal companion app (one user) used daily on a phone. The
> usage spike came from a period of development/testing of streaming chat
> routes, not from public traffic. I have reduced the polling and streaming work
> since then and will keep it within the Hobby limits.
>
> Could you please review the block and unpause the team, or advise the earliest
> way to restore service? Upgrading to Pro is possible if that is the only path,
> but I would prefer not to move the deployment URL.
>
> Team: yuanying
> Project: yuanying (prj_jAu3mWXFr5WWEgSqJPB6UwuibcbE)
> Deployment: dpl_CGWyavoSR37rgS4jzr9WPrhHmT5M
> Blocked at: 2026-11-03T19:29:53Z (reason FAIR_USE_LIMITS_EXCEEDED / fluidDuration)
> Auto-unpause: 2026-12-03T19:29:53Z
>
> Thank you.

## Fallback if support cannot unpause quickly

1. Create a new Hobby team/project, copy env vars, deploy (same repo/commit).
2. Rebuild the collector with the new base URL (v1.0.40) and re-link the PWA
   (new origin → re-login, re-subscribe push).
3. Data is unaffected (Supabase).
   Estimated 30–60 minutes; needs owner approval because the URL changes.

## Mitigation before service returns

- Reduce Fluid Active CPU: the PWA polls `/api/messages` every 60 s while an SSE
  stream is already open — drop the poll when SSE is healthy; lower the SSE
  reconnect frequency; cap `maxDuration` on non-streaming routes.
- Avoid bulk test calls against production (use `?dry=1`).

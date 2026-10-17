# ES-004 — API Authentication

**Status:** Approved (owner, 2026-10-15) — approvals in §5 resolved
**Category:** Feature (security)  
**Tracking:** Proposed P0-05 (confirm assignment in `TRACKING.md`)  
**Depends on:** nothing (global, cross-cutting). **Blocks:** ES-001 v1.1 write endpoints (and any new public write endpoint).

---

## 1. Goal

Stop deployed API routes from being anonymously reachable and prevent cost/abuse exposure, while keeping the single-owner product simple. Route access control must be in place before any new public write endpoint (e.g., habit create/edit) is introduced.

## 2. Current context

Routes under `app/api/*` are unauthenticated. The app URL is not private merely because it is unadvertised. `/api/chat` can incur model cost; `/api/signal`, `/api/activity`, `/api/steps`, `/api/config`, `/api/reminder/*`, and the future `/api/habits` can read or write owner data. `/api/cron/*` already requires `Authorization: Bearer ${CRON_SECRET}`.

## 3. Proposed mechanism (owner recommendation: shared-secret bearer token)

- Add an `API_TOKEN` secret (hosting env). All non-public routes require `Authorization: Bearer ${API_TOKEN}`; return `401` otherwise. Reuse the existing cron pattern.
- **Server/machine clients:** the Android collector sends `Authorization: Bearer ${API_TOKEN}` on all calls. `/api/cron/*` may continue using `CRON_SECRET` or be unified under `API_TOKEN`.
- **PWA (browser) considerations (open question):** a shared secret embedded in the client bundle is **not secret**. Options to settle:
  - **(a)** one-time owner entry — the token is stored in `localStorage` on the owner's device and sent as a header (not truly secret against the device owner, which is acceptable for single-user).
  - **(b)** a lightweight owner session: exchange a password for an **httpOnly** cookie; routes accept either the bearer token (machines) or the session cookie (PWA). **Session duration: 30 days, refreshed on use (owner C1).**
  - **(c)** origin/referrer restriction — weakest; not sufficient alone.
- Do not expose database credentials in the app. Keep secrets in hosting env / approved local secret files.

## 3.1 Rollout phases (owner C3)

Two phases, tracked as sub-tasks under **P0-05**:

- **Logging phase (start early; 7-day grace):** routes evaluate whether the caller *would* be rejected but **do not enforce** `401`. Log each decision to a new **`auth_events`** table — `{ ts, route, ip_hash, would_401, enforced }` — **not** to console. Purpose: confirm both clients send credentials before cutover.
- **Enforce phase (after the 7-day grace):** reject unauthorized callers with `401`.

`auth_events.ip_hash` is a salted hash of the client IP (no raw IP stored).

## 4. Acceptance criteria

- [ ] `API_TOKEN` provisioned; documented rotation procedure.
- [ ] Every non-public route returns `401` without valid credentials and `200` with them.
- [ ] Collector ships credentials; PWA path chosen and implemented.
- [ ] `/api/cron/*` behavior preserved or unified.
- [ ] Secrets never logged or returned in responses; no secret in the client bundle if option (b).
- [ ] Rollback/rollout plan documented (both clients updated before enforcement, or a grace period).

## 5. Approval questions

1. PWA credential model: (a) localStorage token, (b) owner password → httpOnly cookie, or (c) other?
2. Unify `/api/cron/*` under `API_TOKEN`, or keep `CRON_SECRET` separate?
3. Enforcement rollout: hard cutover, or a grace period with logging first?
4. Confirm P0-05 tracking assignment.

## 6. Non-goals

No multi-user accounts, OAuth providers, SSO, or role systems. This is single-owner access control only.

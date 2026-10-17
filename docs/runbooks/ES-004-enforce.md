# Runbook — ES-004 API Authentication: Enforce Phase

**Refs:** `docs/specs/ES-004-api-authentication.md` §3.1, `TRACKING.md` #P0-05
**Grace started:** 2026-10-15 · **Enforce on/after:** 2026-10-22 (7 days)
**Owner of this runbook:** tech lead / agent

---

## 0. TL;DR

After the 7-day logging grace, flip `AUTH_ENFORCE=true` on Vercel **only if**
no legitimate client still logs `would_401 = true`. If anything is off, keep
`AUTH_ENFORCE=false` and fix.

---

## 1. Preconditions

- [ ] ≥ 7 days elapsed since 2026-10-15.
- [ ] PWA logs in (owner password) — `AuthGate` cookie present.
- [ ] Collector **v1.0.12+** installed (sends `Authorization: Bearer`).
- [ ] Secrets present in Vercel (production): `OWNER_PASSWORD`, `API_TOKEN`,
      `SESSION_SECRET`, `IP_SALT`.

## 2. Readiness check (do NOT skip)

Query `auth_events` for the last 24h and confirm legitimate clients are not
being flagged:

```sql
-- Would-be rejections in the last 24h, by route
select route,
       count(*) filter (where would_401) as would_401,
       count(*) as total
from auth_events
where ts > now() - interval '24 hours'
group by route
order by would_401 desc;
```

- **Pass:** routes called by the authenticated PWA/collector show
  `would_401 = 0` (or only expected anonymous probes like a health check).
- **Fail:** a route the PWA/collector uses still shows `would_401 > 0` →
  the client is not sending credentials. Do **not** enforce; fix the client
  and re-check the next day.

Optional: confirm the collector build carries the token:

```bash
# On the phone (USB debugging): look for 200s, not 401s
adb logcat | grep -E "CollectorWorker|ReminderScheduler"
```

## 3. Enforce

```bash
# Production
printf 'true\n' | vercel env add AUTH_ENFORCE production --force
# redeploy so the edge middleware picks it up
git commit --allow-empty -m "chore(auth): enforce ES-004 (AUTH_ENFORCE=true)" && git push
# or: vercel --prod
```

## 4. Verify enforcement

```bash
BASE=https://yuanying-rust.vercel.app
# unauthenticated -> 401
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/config          # expect 401
# public endpoints stay open
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/auth/status     # expect 200
# authenticated (PWA cookie) works; collector bearer works (device)
```

- [ ] `/api/config` (no creds) → `401`
- [ ] `/api/auth/status` → `200`
- [ ] PWA (after login) → chat/signals work
- [ ] Collector (device) → reports succeed, no 401s
- [ ] `/api/cron/*` still gated by `CRON_SECRET`

## 5. Rollback (fast)

```bash
printf 'false\n' | vercel env add AUTH_ENFORCE production --force
# redeploy
```
Reverting to `false` restores the logging-only behavior immediately.

## 6. Notes

- `auth_events` is append-only and has **no raw IPs** (`ip_hash` is salted).
- Do not delete `auth_events` rows; they are the audit trail for the cutover.
- `AUTH_ENFORCE` is read by `middleware.ts` at request time (edge), so a
  redeploy is required after changing it.

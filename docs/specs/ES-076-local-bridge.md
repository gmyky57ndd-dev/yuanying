# ES-076 — Local Bridge During the Vercel Pause

- **Status:** Urgent (P0), temporary. **Tracking:** P2-53. Refs: INC-001.
- **Goal:** keep the owner's daily testing alive while the Vercel team is paused:
  a real production server on the Mac (`next start`, not dev), exposed through a
  Cloudflare quick tunnel, with the collector and a local cron pointed at it.

## 1. Server

- `npm run build` then `npm run start` (production mode, real SSE behaviour).
- `.env.local` supplies every secret (Supabase, DeepSeek, API_TOKEN, CRON_SECRET,
  VAPID). `next start` loads it automatically.
- **Deviation:** `output: 'standalone'` is **not** enabled. Next.js refuses
  `next start` with standalone output (it expects `node .next/standalone/server.js`
  and manually copied `public/` + `.next/static`). For a bridge whose point is
  `next start`, standalone adds packaging risk with no benefit; it stays a
  container-deploy concern. Documented rather than silently skipped.

## 2. Tunnel

- `brew install cloudflared`
- `cloudflared tunnel --url http://localhost:3000` → ephemeral
  `https://<random>.trycloudflare.com`.
- The URL changes on every restart; the collector build must be rebuilt with the
  new base URL (or use a named tunnel + own domain for a stable host).

## 3. Clients

- Collector: `BuildConfig.API_BASE_URL` (Gradle field) replaces the hardcoded
  production host; v1.0.40 is built against the current tunnel URL.
- PWA: open the tunnel URL, log in with the owner password, re-enable push.

## 4. Local cron

`scripts/cron-local.sh` posts to `http://localhost:3000/api/cron/evening-summary`
with `CRON_SECRET` from `.env.local`, using `?force=1` so the 21:00–22:00 guard
does not block a manual test. crontab entry (marker `# yy-evening`):

```
35 21 * * * /Users/alexzhang/DevProjects/yuanying/yuanying-prototype/scripts/cron-local.sh >> /tmp/yy-evening.log 2>&1
```

## 5. As-built (2026-11-04)

- Tunnel: **https://adapter-cakes-realtors-resistant.trycloudflare.com**
  (`cloudflared tunnel --url http://localhost:3000`, quick tunnel).
- Server: `npm run build` + `npm run start` (job kept running in the background).
- Collector: **v1.0.41**, `BuildConfig.API_BASE_URL` / `PWA_URL` point at the
  tunnel; runtime override via `adb shell am start -n com.orbace.yuanying/.MainActivity -e api_base <url>`
  (stored in `yuanying_api/api_base`, read by every worker).
- **Quick tunnels are not durable**: the first URL was revoked by Cloudflare
  after ~1 hour (`Unauthorized: Tunnel not found`, DNS NXDOMAIN). Restarting
  `cloudflared` yields a new URL; repoint the collector with the `api_base`
  override (no rebuild) and re-add the PWA to the home screen.
- Scheduling: **launchd** (`~/Library/LaunchAgents/com.yuanying.evening.plist`,
  21:35 daily) instead of crontab — `crontab` hangs under macOS TCC in this
  environment. `scripts/cron-local.sh` still works manually / from any scheduler.
- Evidence: tunnel `/` 200, `/manifest.json` 200, chat streaming 200 (`在线`);
  presence row `bridge-local-1`; `./scripts/cron-local.sh --force` →
  `{ok:true, date:'2026-11-03', message_id:922}`.

## 6. Acceptance

- [x] `npm run build` has no errors.
- [x] The tunnel serves the PWA over HTTPS (verified with curl).
- [x] Collector heartbeat reaches the local server (presence row).
- [x] The local cron script generates an evening summary and pushes it.

## 7. Security note

The tunnel is public. The app still requires the owner password; API routes keep
the bearer `API_TOKEN`. The bridge is temporary and should be torn down (tunnel
killed, server stopped, crontab line removed) once Vercel is restored.

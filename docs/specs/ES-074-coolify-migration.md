# ES-074 — Coolify Migration Proposal (leave Vercel + Tailscale Funnel)

- **Status:** **Proposal — no infrastructure change has been made.** Awaiting the
  owner's explicit approval (AGENTS §5.4). **Tracking:** P2-54. Refs: INC-001,
  ES-076 (temporary bridge).
- **Owner directive (2026-11-07):** any change to deployment infrastructure
  (domain, host, network layer) requires explicit approval; **Tailscale
  Serve/Funnel must not be the long-term production path**; Tailscale is kept
  only as the internal management network for the Coolify VPS. This document is
  that proposal, not an execution.

## 1. Why

| Problem | Evidence |
| --- | --- |
| Vercel Hobby team paused for fair-use (Fluid CPU) | INC-001: 402 `DEPLOYMENT_DISABLED`, auto-unpause 2026-12-03 |
| Cloudflare quick tunnels revoked hourly | two URLs → NXDOMAIN / `Tunnel not found` |
| Serveo domain on phone DNS blocklists | `ERR_NAME_NOT_RESOLVED` |
| Tailscale Funnel is intermittent with userspace tailscaled | local `200`, external probe `GET / -> 000` while Funnel reports "on" |

Conclusion: none of the tunnel workarounds is a production hosting layer. The
app needs a real host with a real domain.

## 2. Target architecture

```
phone PWA / collector ──HTTPS──► Coolify (VPS) ──► Next.js container
                                     │                 │
                                     │                 └──► Supabase (unchanged, hosted)
                                     └── Traefik + Let's Encrypt (auto TLS)

owner ──Tailscale──► VPS SSH / Coolify UI   (management only, not public ingress)
```

- **Host:** one small VPS (2 vCPU / 4 GB / 40 GB SSD is enough for one app;
  Hetzner CX22 ≈ €4.5/mo, DO/Vultr similar, or an existing VPS the owner has).
- **PaaS:** Coolify (self-hosted, Docker + Traefik), deployed per its official
  one-liner.
- **Runtime:** the existing Next.js app as a Docker/Nixpacks app; `npm run build`
  + `npm run start`, health check `/api/health`, SSE works (no serverless timeout).
- **Domain:** owner-provided (e.g. `yuanying.app`); DNS A/AAAA → VPS; Coolify
  issues Let's Encrypt certs. No domain is purchased without approval.
- **Supabase:** stays as-is (hosted Postgres/Storage). No data migration.
- **Cron:** Coolify scheduled task at 21:35 local → `POST /api/cron/evening-summary`
  with `CRON_SECRET` (replaces the GitHub/pg_cron trigger).
- **Tailscale:** only for SSH/Coolify admin; **no Funnel/Serve** for the app.

## 3. Work plan (after approval)

1. Owner approves provider/region/domain/budget and provides VPS access.
2. Provision VPS, install Coolify, enable Tailscale for management access.
3. Create the app (Dockerfile: Node 20, `npm ci`, `npm run build`, `npm start`),
   set env vars from `.env.local` (Supabase, DeepSeek, API_TOKEN,
   OWNER_PASSWORD, CRON_SECRET, VAPID keys, SESSION_SECRET).
4. DNS + HTTPS; verify `/api/health`, login, chat streaming, SSE.
5. Scheduled task 21:35; verify one evening summary end-to-end.
6. Point the collector at the new domain (v1.0.45) and re-add the PWA.
7. Keep the old deployment as rollback for 7 days; then decommission.

## 4. Risks / rollback

- **Push subscriptions** are per-origin: the owner must re-enable notifications
  on the new domain (same VAPID keys, new subscription).
- **Collector** has a hardcoded default; a new build (v1.0.45) or the `api_base`
  override is required.
- **Cutover downtime:** ~10–20 min; the old site is already down, so no
  additional loss.
- **Rollback:** keep the current code + env; if Coolify fails, restore the
  previous container or the temporary bridge.

## 5. Cost estimate

| Item | Monthly |
| --- | --- |
| VPS (2 vCPU / 4 GB) | $5–10 |
| Domain (if new) | ~$10–15/year |
| Coolify | free (self-hosted) |

## 6. Acceptance

- [ ] `https://<domain>/` serves the PWA over valid HTTPS.
- [ ] Login + chat streaming + SSE work from the phone.
- [ ] Collector heartbeat lands in `device_presence`.
- [ ] One scheduled evening summary is stored and pushed.
- [ ] Tailscale Funnel/Serve is no longer the public entry point.

## 7. Open questions for the owner (blocking)

1. VPS: existing server, or should I propose a provider/region? (Hetzner US/EU?)
2. Domain: which one, and who controls DNS?
3. Budget approval for the VPS + domain (if new).
4. Cutover window preference.
5. **Answered (2026-11-07): keep the temporary bridge running as debug-only**
   until Coolify is live. It is not a production path; shut it down with
   `tailscale funnel --https=443 off` + `launchctl bootout gui/$(id -u)/com.yuanying.web`.

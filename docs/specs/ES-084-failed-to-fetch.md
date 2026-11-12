# ES-084 — Fix Intermittent “Failed to fetch” (Network/Timeout)

- **Status:** In Progress (2026-11-12). **Tracking:** P2-69.
- **Numbering:** the data/feedback task moved ES-084 → **ES-088**.

## 1. Root causes

1. Client `fetchWithTimeout` aborts at **60s**, so any long model/tool run
   becomes an AbortError → “网络断开”.
2. The streaming response has no keep-alive, so an idle proxy/SSE hop can drop
   the connection before the first token.
3. The client retries nothing: one network blip surfaces as “Failed to fetch”.

## 2. Fixes

### 2.1 SSE keep-alive

- `/api/chat` appends `{type:'keepalive'}` to the AI SDK data stream every 5s
  while the stream is open; the client ignores it.
- Streaming headers: `Cache-Control: no-cache, no-transform`,
  `X-Accel-Buffering: no`, `Connection: keep-alive`; `maxDuration = 120`.

### 2.2 Client retry

- `postChat` retries a **network/504 failure before any text** three times
  (1s, 2s backoff), with a 180s per-attempt timeout.
- Emits `onToolEvent({type:'retry', attempt})` so the UI shows
  「网络波动，正在重连…」.
- Partial responses are not blindly replayed; the UI keeps what it received.

### 2.3 Gateway

- Vercel pause is unrelated (INC-001); Tailscale Funnel has no configurable idle
  timeout. Keep-alive covers the tunnel; a future Nginx/Cloudflare config must
  use `proxy_read_timeout 120s`.

### 2.4 Async tools

- Deferred: slow tools (long writes/external APIs) should become queued jobs;
  not required for this fix.

## 3. Acceptance

- [ ] Long thinking / weak network no longer shows “Failed to fetch”.
- [ ] On recovery the client reconnects automatically and delivers the reply.

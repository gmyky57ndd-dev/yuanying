# ES-054 — Collector SSE Refresh Channel

- **Status:** Approved (2026-10-21)
- **Owner decision:** option A — a persistent Server-Sent Events channel from the
  collector to the API, so an owner question reaches the phone in ~1–2 s without
  a third-party push provider.
- **Tracking:** B-26 (steps freshness). Refs: ES-047 (`scheduler`), ES-048
  (collector as hub), P1-62 (server-triggered sync).

## 1. Problem

`get_steps({refresh:true})` writes `config.collector_sync_requested_at` and waits
up to 16 s for a new row. The collector only reads that marker on its
WorkManager cycle (minimum 15 minutes), so the wait usually expires and 元婴 has
to answer with a stale reading. The owner can press 上报步数 for an instant
result, but the AI cannot.

## 2. Design

```
owner: "现在多少步"
  → chat calls get_steps({refresh:true})
  → API writes config.collector_sync_requested_at = now()
  → collector's open SSE stream receives `event: sync`
  → collector runs one immediate collection and POSTs /api/steps
  → get_steps sees the new row and answers with value + as_of
```

### 2.1 Server: `app/api/collector/stream/route.ts`

- `GET`, bearer token required (`Authorization: Bearer $API_TOKEN`), otherwise `401`.
- Response `text/event-stream`, `Cache-Control: no-cache, no-transform`.
- **No in-memory registry** (Vercel may serve the chat request on a different
  instance): the stream polls `config.collector_sync_requested_at` every **2 s**
  and emits `event: sync` with the new timestamp when it changes. The first poll
  only records the baseline, so connecting does not trigger a sync.
- Sends a `: ping` comment every 15 s; closes after 50 s (`maxDuration = 55`)
  and the collector reconnects.
- Cost bound: one connection ≈ 30 config reads/minute, only while the collector
  service is running. No model calls.

### 2.2 Collector: `SyncStreamService` (Android)

- Foreground service, `foregroundServiceType="dataSync"`, low-importance silent
  channel `元婴同步`, ongoing notification that opens the collector.
- Holds one OkHttp streaming GET to `/api/collector/stream` with the bearer
  token; on `event: sync` it enqueues a one-time `CollectorWorker` (the same work
  as the 上报步数 button).
- Reconnects with a 3 s → 30 s backoff after any error or stream end.
- Started from `MainActivity.onCreate` while the app is in the foreground
  (Android 12+ forbids starting a foreground service from the background); once
  running it survives the UI. If it cannot start (OEM restriction), the 15-minute
  `SyncCheckWorker` remains the fallback — the feature degrades, it does not fail.

## 3. Fallbacks (explicit)

| Condition | Behavior |
|---|---|
| `API_TOKEN` missing/empty | stream route returns `401`; collector never connects; 15-min polling only |
| Collector service not running | `get_steps` returns `refresh_pending` + last reading and its timestamp |
| Stream drops / 50 s lifetime | collector reconnects with backoff; queued sync is picked up by the next 15-min poll |
| Notification permission denied (Android 13+) | the service still runs; the notification may be hidden |
| Owner asks while the phone is offline | `refresh_pending`; no fabricated value |

## 4. Acceptance

- [x] `GET /api/collector/stream` without a bearer token returns `401`
      (verified 2026-10-21 in production).
- [x] With a token it holds the connection and emits `event: sync` within ~2 s of
      a new `collector_sync_requested_at` (verified: connected, set the marker
      from another request, received `event: sync` in ~2 s).
- [ ] With the collector service running, "现在多少步" returns a value whose
      `as_of` is within a few seconds.
- [ ] The service survives backgrounding the collector app; killing it falls back
      to the 15-minute poll without an error surfaced to the owner.
- [ ] Battery: one TCP connection, no wake locks, notification importance LOW.

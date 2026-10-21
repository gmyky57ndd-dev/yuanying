# ES-043 — Fix PWA Standalone Mode API Failures

**Status**: Urgent Bug
**Category**: Bug (PWA / Network)
**Tracking**: P2-24
**Refs**: ES-040

## 1. Problem

When the PWA is installed to the phone home screen (standalone mode), the
system degrades:

- Chat requests fail or hang.
- The AI can claim it called `push_to_dev` when no issue was created (silent
  failure → hallucination).

## 2. Fix Checklist

### 2.1 Service Worker API bypass

File: `public/sw.js`.

- Every `/api/` request must bypass the service worker completely (network
  only). No caching, no wrapping.
- `CACHE_NAME` bumped to `yuanying-v3` so installed clients pick up the new
  worker.
- `components/SWRegister.tsx` registers with `updateViaCache: 'none'` so the
  worker script itself is not served stale.

```js
if (url.pathname.startsWith('/api/')) return;
```

### 2.2 Absolute fetch base

`lib/api.ts` uses `window.location.origin` for `API_BASE`; every client fetch
uses `${API_BASE}/api/...`. No relative `/api/...` fetch remains in
`app/`, `components/`, or `lib/`.

### 2.3 No silent tool failures

- The chat API streams a `push_to_dev` data part with `success`, `number`, and
  `error`.
- The client reads that data part and raises a visible error
  (`GitHub Issue 未创建：…`) when the tool fails.
- The chat route persists a deterministic success/failure message from the
  verified tool result (never a model-composed URL).
- The runtime prompt requires: on `success: false`, start with 「没发成功」 and
  include the reason; never say 「发了」.

### 2.4 Test cases

- [x] Browser chat responds normally.
- [x] SW does not intercept `/api/` (production `sw.js` is v3).
- [x] `push_to_dev` success streams a verified number; failure streams
      `success:false` + error.
- [ ] Installed PWA (home screen) chat + `push_to_dev` on the phone.

## 3. Implementation

- `public/sw.js` — API bypass, cache v3.
- `components/SWRegister.tsx` — `updateViaCache: 'none'`.
- `app/api/chat/route.ts` — `StreamData` `push_to_dev` result part; verified
  persisted message.
- `lib/api.ts` — reads the data part and throws on tool failure.
- `app/page.tsx` — alert for GitHub Issue failure.
- `lib/yuanying.ts` — stronger failure wording.

## 4. Acceptance

- [ ] Chat works in browser and installed PWA.
- [ ] `/api/` requests are not handled by the service worker.
- [ ] `push_to_dev` failure produces a visible error and no false success.
- [ ] `push_to_dev` success creates a real GitHub issue.

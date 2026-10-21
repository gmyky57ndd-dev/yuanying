# ES-050 — PWA Version Awareness & Service Worker Update

**Status**: Approved
**Category**: Bug (Self-Awareness / Update Mechanism)
**Tracking**: P3-03
**Refs**: ES-048, ES-049

## 1. Problem

- 元婴 answered “deepseek-chat” when asked for its version; it confused the LLM
  with the PWA application version.
- A deployed frontend change did not prompt installed PWAs to update.
- Settings could show a stale collector version even after the collector was
  updated.

## 2. Fixes

### 2.1 Inject the PWA version

- `package.json` is now **0.2.0**. `lib/app-version.ts` imports `package.json`
  directly, so server and client use the same version. `next.config.mjs` also
  exposes `NEXT_PUBLIC_APP_VERSION` for build-time consumers.
- Settings shows **PWA 版本**.
- `lib/yuanying.ts` injects a runtime **Body Status**:
  - 大脑 (LLM): provider/model from `getActiveModelInfo()`.
  - 前端化身 (PWA): `v<package.json version>`.
  - 神经末梢 (Collector): config version + last report.
- `core/system-manifest.md` states that model, PWA, and collector versions are
  different and must not be conflated.

### 2.2 Service Worker update prompt

- `components/SWRegister.tsx` detects `updatefound` / `installing === installed`.
- If an existing controller is present, it asks:
  “元婴有新版本了，现在刷新以获取最新化形？”
- Re-checks when the PWA becomes visible.
- `public/sw.js` cache bumped to `yuanying-v5` so installed clients detect the
  new worker.

### 2.3 Collector status freshness

- `/api/collector/status` returns `Cache-Control: no-store`.
- `/api/health` is an alias for the same status payload.
- Settings fetches `/api/health` with `cache: 'no-store'`.
- Status includes installed/latest collector version, online state, overlay
  state, last report, and PWA version.

## 3. Acceptance

- [x] PWA version comes from `package.json` and is shown in Settings.
- [x] Asking “你是什么版本” distinguishes LLM, PWA, and Collector.
- [x] New SW version prompts a refresh; cache bumped to v4.
- [x] Collector status uses no-store and reflects the updated version.
- [ ] Owner verifies the update prompt and version answer on the phone/Mac PWA.

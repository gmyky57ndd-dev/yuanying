# ES-048 — Collector as Hub & PWA Lifesaver

**Status**: Approved
**Category**: Architecture / Android Client
**Tracking**: P3-01
**Refs**: Issue #54, Issue #56, ES-040

## 1. Goal

The Collector is the host body; the PWA is the soul. If the PWA icon is lost,
the Collector must be able to launch or restore it. The Collector also provides
an always-on-top Xiaowu bubble that the browser cannot.

## 2. Launchpad

- Collector main button: **启动元婴**.
- Tries to launch the installed WebAPK via the `https://yuanying-rust.vercel.app`
  intent.
- If no WebAPK is detected, opens the browser and shows a dialog:
  “请点击浏览器菜单 →「添加到主屏幕」，即可恢复元婴。”
- Detection is best-effort (`org.chromium.webapk*` package).

## 3. Always-on-top overlay

- `SYSTEM_ALERT_WINDOW` permission; `OverlayService`.
- Main screen switch **开启悬浮元婴**; if permission is missing, opens the
  system overlay permission screen.
- Draggable 56dp Xiaowu bubble.
- Tap → small overlay panel with a one-line note input and **记下**; posts to
  `/api/note` without opening the PWA.
- Overlay state is reported in the heartbeat as `overlay_active`.

## 4. Health check & versioning

- Collector heartbeat writes `collector_version`,
  `collector_version_code`, `collector_last_report_at`, `overlay_active`.
- `/api/collector/status` returns installed/latest version, online state
  (last seen < 2h), overlay state, and update URL.
- Settings shows collector version, last report, online/offline, overlay state,
  PWA version, update prompt, **立即同步采集器**, and **检查 PWA 更新**.
- PWA update check calls `ServiceWorkerRegistration.update()` and prompts a
  reload if a new worker is waiting.

## 5. Server-triggered sync (Issue #56)

- Settings writes `collector_sync_requested_at`.
- `SyncCheckWorker` polls every 15 minutes (WorkManager minimum) and enqueues a
  one-time collection when a newer request appears.
- Limitation: true <30s sync requires FCM/push; Android WorkManager cannot poll
  faster than 15 minutes. The UI says “下次后台唤醒时执行”.

## 6. Acceptance

- [x] Collector has a prominent **启动元婴** button with restore guidance.
- [x] Overlay toggle + draggable avatar bubble + quick note input.
- [x] Settings shows collector version/online/overlay and PWA version.
- [x] Update prompt for collector and PWA.
- [x] Server sync request marker + 15-min sync check.
- [ ] Owner verifies overlay and restore on the phone.

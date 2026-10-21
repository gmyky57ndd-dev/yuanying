# PWA Client Restore Runbook

**Issue**: #54
**Goal**: recover the 元婴 PWA after the home-screen icon is removed, then confirm
the collector is alive. Target: under 10 minutes.

## 1. Reinstall the PWA (2 minutes)

1. Open the phone browser (Chrome on Android; Safari on iOS).
2. Go to **https://yuanying-rust.vercel.app**.
3. Log in with the owner password.
4. Add it to the home screen:
   - **Android Chrome**: ⋮ menu → **Add to Home screen** / **Install app**.
   - **iOS Safari**: Share → **Add to Home Screen**.
5. Open the new home-screen icon.

## 2. Confirm the collector (2 minutes)

In the PWA: **设置 → 采集器与客户端**.

Expected after the collector's next hourly run (or after opening the collector
app and tapping **测试一次**):

- **采集器版本**: `v1.0.29 (30)` or newer.
- **最后上报**: a recent timestamp.
- No "未上报" / "没有记录".

If it shows “未上报”:

1. Open the **元婴采集器** app.
2. Check it is installed. If not, use the Play internal link:
   https://play.google.com/apps/internaltest/4701496216557819136
3. Grant/verify permissions:
   - Usage access (使用情况访问)
   - Notifications
   - Health Connect steps permission
4. Tap **测试一次** and re-open the PWA Settings.

## 3. Confirm the first signal (1 minute)

On Home, tap **水** (or wait for the collector's next hourly run). Then check:

- Home activity stream shows the new row.
- Settings → 采集器与客户端 shows a fresh last-report time.
- History → today shows the signal.

## 4. Update the collector from inside the PWA (2 minutes)

If Settings shows **有新版本 vX**:

1. Tap the update button.
2. It opens the Play internal-testing page.
3. Update the collector, reopen it once, then reopen the PWA.
4. Settings should show the new version and a fresh report time.

## 5. Floating Xiaowu (optional)

1. Open **元婴采集器** → **开启悬浮元婴**.
2. Grant **显示在其他应用上层** / **SYSTEM_ALERT_WINDOW**.
3. A draggable **元婴** bubble appears. Drag it anywhere.
4. Tap the bubble to open a one-line note input; **记下** saves it to your notes without opening the PWA.
5. The PWA Settings → 采集器与客户端 shows **悬浮元婴: 开启**.

## 6. Re-add icon / prevent accidental removal

Browsers own the uninstall action; the PWA cannot block it. If the icon is
removed:

- Open the site in the browser and use **Add to Home screen** again.
- Settings → 采集器与客户端 includes an **添加到主屏幕** button when the
  browser exposes the install prompt; otherwise use the browser menu.

Do not uninstall the **元婴采集器** app; it is separate from the PWA icon.

## 7. Acceptance checklist

- [ ] PWA icon restored and opens.
- [ ] Settings shows collector version + last report.
- [ ] A new signal appears in the activity stream.
- [ ] Update button works when a newer collector exists.
- [ ] Recovery completed in under 10 minutes.

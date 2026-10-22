# ES-061 — System Status Tool, Cron Reality Check, Avatar/Voice Integration

- **Status:** Urgent Bug + Feature. **Tracking:** P2-37.
- **Parts:** (1) `get_system_status` tool, (2) cron/reminder findings, (3) avatar
  and voice integration spec.

## 1. `get_system_status` tool

- Table `system_events` (migration `023_system_events.sql`): `ts`, `route`,
  `status`, `duration_ms`, `error`, `meta`. No user content.
- `lib/system-events.ts`: `recordSystemEvent`, `getRecentSystemEvents`,
  `describeEvent`.
- `/api/chat` writes one row per turn (status 200, or 500 with the stream
  error) and includes `empty_reply` / `retried` in `meta`.
- Tool returns: last event with a plain-language diagnosis, the last 5 events,
  and the collector heartbeat (`version`, `last_report_at`, `steps_status`,
  `steps_at`, `steps_error`).
- Prompt + manifest require 元婴 to call it when the owner reports a failure and
  to quote the diagnosis instead of apologising.

## 2. Cron and reminder findings (2026-10-22)

| Question | Finding |
|---|---|
| `vercel.json` cron entries | **None** (`"crons": []`). |
| Morning briefing | **Never implemented** — no habit, signal, or reminder rule. Not a regression; it does not exist. |
| 21:30 evening check-in | A collector-side fixed-time habit (`evening_checkin`), delivered by Android, not by Vercel. |
| Why it did not fire | The collector stopped reporting at **2026-10-22T13:53Z** (09:53 EDT); a dead/hibernated collector cannot deliver. |
| `/api/cron/*` auth | Excluded from the ES-004 middleware matcher, so `AUTH_ENFORCE` is not the cause. |

**Decision:** delivery stays on the collector (ES-048 architecture). Reliability
work is a separate item: boot receiver to restart the foreground service, a
server-side watchdog that records "collector silent > 2 h" in `system_events`,
and a Settings notice. A Vercel cron cannot wake a dead phone.

## 3. Avatar and voice integration

Owner-facing asset guide: `docs/help/avatar-assets.md`. Engineering summary:

- **Rendering:** `pixi-live2d-display` (Cubism 3/4) mounted in the existing
  `AvatarStage`; files under `public/avatar/<fenshen_id>/`; fall back to the
  static `avatar.png` on load failure or low memory; pause the render loop when
  the tab is hidden or the stage is collapsed.
- **Voice:** server-side TTS proxy (`/api/tts`) keyed by `voice_id` stored on the
  fenshen; provider chosen via the existing router pattern (ElevenLabs / Fish
  Audio); API keys never reach the client; audio cached by hash; silent mode
  suppresses playback; `<audio>` element replaces `speechSynthesis` when a
  cloned voice is configured, with `speechSynthesis` as fallback.
- **Phasing:** P1 static Live2D + one fixed voice; P2 per-fenshen voice/avatar
  switching + cache; P3 lip sync.

## 4. Acceptance

- [ ] Empty reply → 元婴 can call `get_system_status` and name the failure.
- [ ] The 21:30 reminder is delivered when the collector is alive; watchdog
      records when it is not.
- [ ] Avatar/voice guide published and linked from #72.

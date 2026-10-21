# ES-040 — 首次化形 (Avatar & Voice)

**Status**: Approved (Stage v1 delivered with placeholder)
**Category**: Feature (Phase C)
**Tracking**: P2-30
**Refs**: Issue #54

## 1. Goal

Make Xiaowu visibly present: an avatar stage at the visual center, hold-to-talk,
automatic TTS for replies, and animation states driven by the chat lifecycle.

## 2. Delivered in Stage v1

### 2.1 Avatar stage

- New `components/AvatarStage.tsx`.
- Default height **60vh** (min 380px), with a collapse mode for chat.
- Uses the active Fenshen avatar (`avatar_url` / `avatar.png` placeholder).
- State-driven animation:
  - `idle` — breathing.
  - `thinking` — slower pulse/desaturated.
  - `speaking` — speaking pulse.
  - `listening` — red ring + mic pulse.
- Navigation to History / Feedback / Settings lives in the stage.
- The chat/activity area sits below the stage; the stage can be collapsed.

### 2.2 Voice

- **STT**: the stage mic is hold-to-talk (pointer down/up) using the existing
  browser SpeechRecognition; the transcript is sent as a chat message.
- **TTS**: assistant replies auto-play through `speechSynthesis` when voice is
  enabled; code blocks/URLs are stripped first. A 声/静 toggle is in the stage.
- Reminder TTS remains unchanged.

### 2.3 Renderer status

The current renderer is a styled placeholder using the existing avatar image.
`pixi-live2d-display` / VRM will replace the image when the owner provides a
model asset; the stage API is renderer-agnostic (`state`, `avatarUrl`, voice
callbacks). No model asset or Cubism core is bundled in this pass.

## 3. Files

- `components/AvatarStage.tsx`
- `app/page.tsx` — stage integration, hold-to-talk, TTS.
- `app/globals.css` — idle/thinking/speaking/listening animations.

## 4. Acceptance

- [x] Avatar stage occupies the visual center (60vh) and can collapse.
- [x] Hold-to-talk sends a transcript.
- [x] Assistant replies auto-play TTS; mute toggle works.
- [x] Animation state follows idle/thinking/speaking/listening.
- [ ] Owner supplies a Live2D/VRM model; renderer swap.
- [ ] Phone visual/voice check.

## 5. Safety / limits

- TTS is local browser speech, not a cloud voice service.
- No new capture surface: mic uses the existing chat input path.
- Respect `prefers-reduced-motion`.

# ES-068 — Voice Input Accuracy & UX

- **Status:** Approved (2026-10-26). **Tracking:** P2-46. Refs: ES-040, #84.
- **Goal:** long spoken sentences become accurate, punctuated text that lands in
  the composer for review — never auto-sent.

## 1. Problems

| Problem | Example |
| --- | --- |
| Web Speech misrecognises domain words | "Issue" → "医学" |
| No punctuation, filler words | 30 s of "就是说 / 对不对" |
| Auto-send | the transcript goes out before the owner can fix it |

## 2. Changes

### 2.1 Server-side STT (`POST /api/stt`)
- The browser records audio (`MediaRecorder`, webm/opus or mp4) and posts it as
  multipart `audio`.
- The server calls **OpenAI Whisper (`whisper-1`)** with `OPENAI_API_KEY`; the key
  never reaches the client.
- 20 MB cap, 45 s upstream timeout, structured errors
  (`stt_unavailable` / `stt_failed` / `stt_timeout`).
- `GET /api/stt` reports `{available, provider}` so the client can choose.

### 2.2 No auto-send
- The transcript is appended to the composer, the field is focused with the caret
  at the end, and the keyboard stays open. Sending is always an explicit tap.
- Applied to both the Whisper path and the Web Speech fallback.

### 2.3 VAD
- `AnalyserNode` RMS monitoring: recording stops **2 s after speech ends**;
  8 s with no speech aborts; 60 s hard cap.
- Releasing a hold-to-talk button schedules a 2 s grace stop instead of cutting
  the last syllables.

### 2.4 Prompt tolerance
- `lib/yuanying.ts` + `core/system-manifest.md`: transcripts may contain
  repetition, stutters and homophones; 元婴 ignores the noise, extracts the
  instruction, and never comments on grammar or transcription quality.

## 3. Configuration

`OPENAI_API_KEY` is not set in this deployment, so `/api/stt` returns
`{available:false}` and the client falls back to Web Speech — the no-auto-send,
VAD and prompt fixes still apply. Add the key in Vercel to enable Whisper.

## 4. Acceptance

- [ ] 30 s of spoken Chinese → punctuated text with fewer homophone errors
      (requires `OPENAI_API_KEY`).
- [x] The transcript lands in the composer and can be edited before sending.
- [ ] "就是说…Issue…对不对" → the AI executes the instruction without commenting
      on the phrasing.

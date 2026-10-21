# ES-044 — Fix PWA Tool Calling Stream Failure

**Status**: Urgent Bug
**Category**: Bug (Agentic Loop / PWA)
**Tracking**: P2-25
**Refs**: ES-043

## 1. Problem

In installed PWA mode, asking 元婴 to run `push_to_dev` can result in text like
“现在发” without any network request or GitHub issue. Separately, when the tool
does run, a slow GitHub API or SSE disconnect can leave the UI at “信号中断”
with no explicit error.

## 2. Fixes

### 2.1 Force a real tool call

- Runtime prompt: when the owner asks to send/create an issue, `push_to_dev`
  MUST be called after confirmation. Never say 「现在发」「已发」「发了」 from
  text alone; if not calling, say 「还没发」.
- Manifest: same rule under **Confirm Before Sending**.

### 2.2 Tool-call stream + loading UI

- `app/api/chat/route.ts` streams `push_to_dev` lifecycle data parts:
  - `{ type:'push_to_dev', status:'sending' }` before execution.
  - `{ type:'push_to_dev', status:'done', success, number, error }` after.
- `lib/api.ts` forwards these data parts to the page and still throws on
  `success:false`.
- The chat bubble shows **⚙️ 正在发送到 GitHub…** while the tool is running and
  **已发送，正在整理…** on success.
- On failure, the client alerts with the GitHub error; on network/timeout it
  alerts **网络断开，发送失败。**. The header also shows the red error text.

### 2.3 Timeout / SSE disconnect

- `app/api/chat/route.ts` keeps `export const maxDuration = 60`.
- `lib/github.ts` wraps every GitHub API call in an 8-second `AbortController`.
  A slow GitHub response fails the tool quickly instead of hanging the SSE
  stream.
- The tool returns `success:false` with the timeout reason, so the client can
  alert and persist an honest failure message.
- No background queue is introduced in this hotfix; the bounded timeout keeps
  the chat request within the serverless window.

## 3. Implementation

- `lib/github.ts` — `githubFetch` with 8s timeout for create/list/verify/get.
- `app/api/chat/route.ts` — sending/done `StreamData` parts; verified persisted
  message.
- `lib/api.ts` — unwrap data parts, forward tool events, throw on failure.
- `app/page.tsx` — GitHub-specific loading status and failure/network alerts.
- `lib/yuanying.ts` + `core/system-manifest.md` — force real tool calls.

## 4. Acceptance

- [x] Tool execution emits a `sending` data part and a `done` part (verified in production).
- [x] Success/failure data parts are verified in the stream.
- [x] GitHub API calls time out after 8s instead of hanging.
- [x] Client shows “正在发送到 GitHub…” and alerts on failure/network error.
- [ ] Installed PWA: ask to send an issue and confirm a real issue or visible
      error on the phone.

# ES-046 — Fix API Timeout & Tool Call Stream Disconnect

**Status**: Urgent Bug (P0)
**Category**: Backend Network / Vercel Config
**Tracking**: P2-27
**Refs**: ES-044, ES-045

## 1. Problem

Tool calls can exceed the serverless window while waiting for GitHub and a
second DeepSeek step. Vercel cuts the SSE stream and the client shows a generic
“信号中断”.

## 2. Fixes

- `app/api/chat/route.ts` keeps `export const maxDuration = 60`.
- Every GitHub API request has an 8s `AbortController`.
- `push_to_dev` gets a 5s synchronous budget. On timeout/network failure it
  enqueues an `agent_jobs` row and returns
  `{ success:true, data:{ queued:true, job_id } }` instead of blocking the
  stream. The model must say “已提交后台队列，稍后确认”.
- Queued jobs are processed by the existing PWA reminder poll
  (`/api/reminder/due`), which calls `processPendingJobs(1)`. On completion an
  assistant message with the issue link is inserted; after 3 failed attempts it
  inserts a visible failure message.
- The client shows “已提交，后台处理中…” for queued jobs, a red error for
  failures, and maps HTTP 504 to “服务器处理超时，请重试”.
- `maxSteps: 3` remains the hard cap on model/tool loops.

## 3. Acceptance

- [x] `maxDuration = 60` present.
- [x] GitHub calls cannot hang indefinitely.
- [x] Slow GitHub falls back to an async job instead of breaking SSE.
- [x] Queued jobs are processed by the PWA poller and report back (test job → issue #51, closed).
- [x] 504/network errors are explicit.
- [ ] Phone PWA: `push_to_dev` either returns a real link or a visible queued/error state.

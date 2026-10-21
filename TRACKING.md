# 元婴 — Feature & Bug Tracking Log

**Purpose**: Single source of truth for what's done, in progress, and to do.
**Owner**: Tech lead (final authority on state); agents update their own items.
**Refs**: `AGENTS.md` v1.3, `docs/Dev Response 1014.md`, `docs/APPENDIX for 1014 response.md`.

---

## Status definitions

| Status | Meaning |
|---|---|
| **To Do** | Not started. Approved/scheduled. |
| **In Progress** | Actively being worked on. Has an owner. |
| **Blocked** | Cannot proceed. Reason + unblocker recorded. |
| **In Review** | Code complete; awaiting verification (owner/device/production). |
| **Done** | Verified in the intended environment, evidence recorded. |
| **Backlog** | Captured, unscheduled. No commitment. |
| **Won't Do** | Explicitly rejected. Reason recorded. |

---

## Current Sprint: v2 (P0 + P1, 2026-10-14 revision)

**Revision note**: Reminder architecture changed — generation **and** delivery move into the **Android collector** (P1-09). External cron and Vercel Pro were **rejected**. All daily counts must use `lib/timezone.ts` / `getTodayRange` (AGENTS §6).

### Sprint exit criteria (updated)

- [ ] PWA has 3 buttons (wake / sleep / water), all functional
- [ ] water reminder fires at 10:30 / 15:30 / 20:00 with TTS
- [ ] standup reminder fires hourly 09:00–18:00 when idle ≥ 50 min
- [ ] vitamin reminder fires at 08:30
- [ ] Android collector reports steps hourly via HealthConnect
- [ ] reminders generated + delivered by the collector (no PWA open required)
- [ ] owner has used it daily for 7 days without major bugs

---

## Scheduled reminders

- **2026-10-22** — **[P0-05] ES-004 enforce phase**: set `AUTH_ENFORCE=true` on Vercel (after the 7-day grace) — only once legitimate clients show `would_401=false` in `auth_events`. Runbook: `docs/runbooks/ES-004-enforce.md`.

## In Progress

### [P1-01] Reminder scheduler

- **Status**: In Progress
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 App A; `docs/Dev Response 1014.md` §3
- **Description**: Scheduler logic retained in TS, but **implementation migrating to Kotlin** in the collector (P1-09). The TS scheduler remains only for the PWA-open fallback.
- **Notes**: Per Dev Response §2.1/§3 — do not treat as Done; the delivery path moves to Android.

### [P1-03] Client reminder poller (PWA-open fallback)

- **Status**: In Progress
- **Owner**: @agent
- **Opened**: 2026-03-17
- **Phase**: P1
- **Refs**: spec v2 App A.4; `docs/Dev Response 1014.md` §3
- **Description**: `ReminderPoller` demoted to a **fallback that only runs while the PWA is open**. Primary delivery becomes the collector (P1-09).
- **Notes**: Keep mounted; do not invest further until P1-09 lands.

### [P2-06] Phase C — Home restructure (ES-026)

- **Status**: Done (2026-10-18) · **Category**: Feature (UI/UX) · **Refs**: ES-026 · **Opened**: 2026-10-18
- **PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/17
- **Spec**: `docs/specs/ES-026-phase-c-ui-restructure.md`.
- **Label note**: the handoff requested P2-01..P2-05, but those IDs are the Opinions items; Phase C uses P2-06..P2-10.
- **Impl**: active Fenshen avatar/name from `/api/fenshen` (tap opens Settings); five core habits in `components/HabitGrid.tsx`; steps debug modal preserved; today-only activity/chat.
- **Acceptance**:
  - [x] Home shows today only; empty state present.
  - [x] Five habits in one compact grid; no new capture surface.
  - [x] Fenshen avatar opens Settings; fallback avatar/name works.

### [P2-07] Phase C — History restructure (ES-026)

- **Status**: Done (2026-10-18) · **Category**: Feature (UI/UX) · **Refs**: ES-026 · **Opened**: 2026-10-18
- **PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/17
- **Impl**: day list now shows water/standup/steps; detail adds full notes + tags and AI conversation excerpts; raw activity and chat log remain.
- **Acceptance**:
  - [x] Day list + tap-to-detail.
  - [x] Full notes and tags visible in detail.
  - [x] Standup count included in the day aggregation.

### [P2-08] Phase C — Chat message actions (ES-026)

- **Status**: Done (2026-10-18) · **Category**: Feature (UI/UX) · **Refs**: ES-026, ES-019 · **Opened**: 2026-10-18
- **PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/17
- **Impl**: `⋮` menu keeps Push to GitHub / Save to Inbox / Copy; Push shows a spinner then `Issue #N`; Save persists `metadata.inbox_path` and shows **Saved to Inbox**.
- **Acceptance**:
  - [x] `⋮` menu actions wired.
  - [x] Push spinner + issue link.
  - [x] Save to Inbox badge persists via message metadata.

### [P2-09] Phase C — Tool-loading state (ES-026)

- **Status**: Done (2026-10-18) · **Category**: Feature (UI/UX) · **Refs**: ES-026 · **Opened**: 2026-10-18
- **PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/17
- **Impl**: chat shows a spinner + context-aware status bubble while a tool-requiring message is in flight. Client-side intent hint, not a server tool trace.
- **Acceptance**:
  - [x] Visible loading state while waiting.
  - [x] Does not claim a tool result before the reply arrives.

### [P2-10] Phase C — Visual polish (ES-026)

- **Status**: Done (2026-10-18) · **Category**: Feature (UI/UX) · **Refs**: ES-026 · **Opened**: 2026-10-18
- **PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/17
- **Impl**: subtle `fade-in` for chat messages; breathing Fenshen avatar; `prefers-reduced-motion` fallback; stone/green palette.
- **Acceptance**:
  - [x] Fade-in and breathing animations.
  - [x] Reduced-motion fallback.
- **Verified (2026-10-18, prod, PR #17, deploy run `39153665136`)**: home bundle contains the five habit labels and Saved-to-Inbox strings; `/api/history/days` returns `standup` (e.g., 2026-10-17: water 4, standup 6); CSS contains `fadeIn`, `breathe`, and the reduced-motion rule.

### [P2-11] Elevate summary tone — partner vs QA (ES-027)

- **Status**: In Review (2026-10-19) · **Category**: Prompt Update · **Refs**: ES-027 · **Opened**: 2026-10-19
- **Label note**: the handoff labeled this **P2-06**, but P2-06 is the completed Phase C / ES-026 item; renumbered to **P2-11**.
- **PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/19
- **Impl**: `lib/summary-generator.ts` exports `SUMMARY_TONE_RULES`; `lib/yuanying.ts` injects them into `## Daily Summaries`. Rules: describe what the work means (not a QA log), use "we"/"I" (元婴), and draft the summary then ask "要我存下来吗？" instead of offering an empty menu.
- **Acceptance**:
  - [x] Prompt contains the meaning / first-person-plural / no-empty-menu rules.
  - [ ] Owner verifies a real summary reads as a reflection, not a QA log, and ends with a draft confirmation.

### [P2-12] Model router & provider abstraction (ES-029)

- **Status**: In Review (2026-10-19) · **Category**: Feature (Architecture) · **Refs**: ES-029 · **Opened**: 2026-10-19
- **PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/19
- **Label note**: the handoff labeled this **P2-07**, but P2-07 is the completed Phase C / ES-026 history item; renumbered to **P2-12**.
- **Impl**:
  - `supabase/migrations/017_models.sql` + `supabase/schema.sql` — `models` table and `config.active_model_id` (seeded `deepseek-chat`). Applied to the configured Supabase.
  - `lib/llm-router.ts` — DB-driven router for `deepseek`, `openai`, `anthropic`, and `custom` (OpenAI-compatible base URL); DB key first, env key fallback; explicit errors for missing model/key/base URL/unsupported provider.
  - `app/api/models/route.ts` — list/add/activate/delete; list never returns `api_key`; active model cannot be deleted.
  - `app/api/models/test/route.ts` — sends a small ping through the selected model.
  - `app/settings/page.tsx` — Models list, provider/name/key/base-URL form, active radio, test button.
  - `app/api/chat/route.ts` — replaced the hardcoded DeepSeek fetch loop with AI SDK `streamText` + `maxSteps` tools; persists via `onFinish`; model-router failures return `{ success: false, error }`.
  - `lib/api.ts` — consumes the AI SDK data stream and preserves the existing chat UI contract.
  - `core/system-manifest.md` — documents Settings → 模型 and model-failure truthfulness.
  - `docs/help/model-router.md` — owner + 元婴 guide (Issue #20).
  - `get_model_info()` tool — returns active model id/provider/name/base URL/key availability, never the key (Issue #20).
- **Dependencies**: `ai@4.3.19`, `@ai-sdk/openai@1.3.24`, `@ai-sdk/anthropic@1.2.12`, `zod@3.25.76` (AI SDK peer).
- **Verified (2026-10-19, local dev + configured Supabase)**:
  - `GET /api/models` returns `deepseek-chat` with `has_api_key:false` (env key fallback).
  - `POST /api/models/test {id:"deepseek-chat"}` → `{success:true, reply:"ok"}`.
  - `POST /api/chat` returns an AI SDK data stream (`0:"..."`) and persists both messages; test messages were removed afterwards.
  - CRUD: added a temporary custom model, activated it, confirmed deletion of the active model is blocked, restored `deepseek-chat`, deleted the temporary model.
  - `tsc`, lint, and production build pass.
- **Acceptance**:
  - [x] User can add a model via Settings (API/UI wired).
  - [x] User can switch the active model.
  - [x] Chat API uses the active model.
  - [x] Missing model / bad key / unsupported provider returns `success:false`; the chat UI surfaces the error.
  - [x] DeepSeek continues to work through the router.
  - [ ] Owner verifies the Settings form and a real chat message on the deployed PWA.

### [P2-13] Google Drive read-only import (ES-030)

- **Status**: In Review (2026-10-19) · **Category**: Feature (Integration / Tool) · **Refs**: Issue #18, ES-030 · **Opened**: 2026-10-19
- **Spec**: `docs/specs/ES-030-google-drive-read-tool.md`.
- **Intake**: Issue #18 requests a read-only Drive tool with `drive.readonly`, explicit provenance, and no write/delete/share permissions.
- **Impl**:
  - `supabase/migrations/018_google_drive.sql` — adds `google_drive` to the signals source constraint and creates `google_oauth_tokens` (server-side singleton).
  - `lib/google-drive.ts` — OAuth URL/state, code exchange, refresh, status/disconnect, file-id parsing, `files.export` text/plain, duplicate guard, and note insert.
  - `app/api/integrations/google-drive/{route,authorize,callback}` — status/disconnect, Google consent redirect, and CSRF-checked callback.
  - `app/api/chat/route.ts` — `get_drive_doc(file_id)` tool.
  - `app/settings/page.tsx` — Google Drive authorization/status/disconnect UI.
  - `core/system-manifest.md` — documents the tool and the Settings authorization.
  - `middleware.ts` — callback is public; OAuth `state` cookie is the guard.
- **Storage**: notes are stored in `signals` (`name='note'`), with `source='google_drive'` and `context.file_id` + `file_url` + `imported_at`.
- **Known boundary**: only Google Docs and `text/*` files are supported in this pass; Sheets/PDF/binary return an explicit error.
- **Verified (2026-10-19, local)**:
  - Migration applied to the configured Supabase.
  - `GET /api/integrations/google-drive` returns status without tokens.
  - `get_drive_doc` returns an explicit "not connected" error instead of a fake import.
  - `tsc`, lint, and build pass.
- **Blocked verification**: end-to-end OAuth/import needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and an authorized redirect URI in Google Cloud. Owner must configure these on the phone/PWA deployment.
- **Acceptance**:
  - [ ] Owner can authorize Google Drive via Settings on the phone.
  - [ ] 元婴 reads a Drive link and summarizes its contents in chat.
  - [ ] Imported text is saved with `source='google_drive'` and `context.file_id`.
  - [ ] Read-only boundary confirmed (no write/delete/share).

### [P2-14] Data sovereignty & backup (ES-031)

- **Status**: In Review (2026-10-19) · **Category**: Feature (Infrastructure) · **Refs**: ES-031, AGENTS §12 · **Opened**: 2026-10-19
- **Spec**: `docs/specs/ES-031-data-sovereignty.md`.
- **Label note**: the handoff requested **P2-09**, but P2-09 is the completed Phase C tool-loading item; renumbered to **P2-14**.
- **Impl**:
  - `AGENTS.md` — added §12 Data Sovereignty & Backup; version 1.9.
  - `.github/workflows/db-backup.yml` — weekly Sunday 00:00 UTC `pg_dump` via `postgres:17`, writes `backups/db/YYYY-MM-DD.sql`, commits and pushes.
  - `app/api/export/route.ts` — authenticated ZIP export of all user tables + `core/` Markdown; paginated 1000 rows/page; excludes `models.api_key` and `google_oauth_tokens`.
  - `app/settings/page.tsx` — **导出我的元婴** button.
  - `jszip@3.10.1` dependency.
- **Required secret**: `SUPABASE_DB_URL` in GitHub Actions. The workflow fails loudly if it is missing.
- **Verified (2026-10-19, local)**:
  - `GET /api/export` without auth → `401`; with `Authorization: Bearer <API_TOKEN>` → `200 application/zip`.
  - ZIP contains `yuanying-data-export.json` (531 KB) + `core/**` Markdown; manifest counts: messages 196, signals 682, summaries 10, reminders 98, habits 3, config 7, fenshen 3, models 1.
  - `models` export has no `api_key`; `google_oauth_tokens` is absent.
  - `tsc`, lint, and production build pass.
- **Acceptance**:
  - [x] Weekly backup workflow exists.
  - [x] Export endpoint returns a ZIP with DB tables + core Markdown.
  - [x] Secrets are excluded from the export.
  - [x] `tsc`, lint, and build pass.
  - [ ] First scheduled workflow run verified in GitHub Actions.
  - [ ] Owner downloads the ZIP on the phone.
- **Restore**: see `docs/specs/ES-031-data-sovereignty.md` §6.

### [P2-18] Google Drive formats — txt / csv / json / zip (ES-035)

- **Status**: In Review (2026-10-20) · **Category**: Feature (Tool) · **Refs**: Issue #28, ES-035, ES-030 · **Opened**: 2026-10-20
- **Spec**: `docs/specs/ES-035-drive-file-formats.md`.
- **Impl**:
  - `lib/drive-parsers.ts` — CSV parser (quoted fields/newlines), JSON parser, MIME classifier, ZIP path guard.
  - `lib/google-drive.ts` — 20 MB download cap, CSV preview (50 rows), JSON pretty-print, ZIP listing + text extraction, 50-entry/5 MB/15 MB limits, truncation metadata.
  - `app/api/chat/route.ts` — updated `get_drive_doc` description.
  - `core/system-manifest.md` — documents supported formats.
- **Verified (2026-10-20, local)**:
  - Real legacy CSV (`entries.csv` from the Drive zip): 12 headers, 602 rows, 50-row preview, `truncated:true`.
  - JSON sample: parsed and pretty-printed; invalid JSON has an explicit error.
  - Real Drive ZIP (`Blinking Habit & Entries Export (CSV)`, 2 entries): tool listed `entries.csv`/`routines.csv` and returned content; test note removed afterward.
  - ZIP path guard rejects `..`, absolute, drive-letter, and NUL paths.
  - `tsc`, lint, and production build pass.
- **Acceptance**:
  - [x] CSV parsing with headers/rows and truncation.
  - [x] JSON parsing with structure preserved.
  - [x] ZIP listing and readable text-file extraction.
  - [x] Size limits, truncation reporting, and path-traversal guard.
  - [ ] Owner tests their own CSV/JSON/ZIP on the phone after deploy.

### [P2-19] Web search + Markdown reader (ES-036)

- **Status**: In Review (2026-10-20) · **Category**: Feature (Tool Integration) · **Refs**: ES-036 · **Opened**: 2026-10-20
- **Spec**: `docs/specs/ES-036-web-search.md`.
- **Label note**: the handoff requested **P2-11**, but P2-11 is the completed ES-027 summary-tone item; renumbered to **P2-19**.
- **Impl**:
  - `lib/web-search.ts` — Tavily primary (`TAVILY_API_KEY`), DuckDuckGo HTML fallback, Jina Reader/DDG fallback for blocked serverless IPs; top 3 title/url/snippet results; no raw HTML.
  - `lib/read-markdown.ts` — allowlisted Markdown reader (`docs/specs`, `docs/help`, `docs/runbooks`, `core`, `AGENTS.md`, `TRACKING.md`, `README.md`), 20k-char cap, path-traversal guard.
  - `app/api/chat/route.ts` — `web_search(query)` and `read_markdown(path)` tools.
  - `core/system-manifest.md` — tool list + Web search & Markdown rules.
  - `lib/yuanying.ts` + `app/api/chat/route.ts` — per-request tool-availability reminder so old “no web search” history cannot override the real tools.
  - `.env.example` — optional `TAVILY_API_KEY`.
- **Verified (2026-10-20, local)**:
  - `web_search("How to use the Vercel AI SDK with tools?")` → DuckDuckGo, 3 parsed results; Jina fallback path also verified with a simulated DDG 403.
  - Chat called `web_search` and answered with cited URLs (`ai-sdk.dev` docs).
  - `read_markdown("docs/specs/ES-036-web-search.md")` → text; traversal and non-allowlisted paths rejected.
  - `tsc`, lint, and build pass.
- **Acceptance**:
  - [x] `web_search` returns top-3 parsed results.
  - [x] DuckDuckGo fallback works without an API key.
  - [x] `read_markdown` reads allowlisted Markdown and rejects unsafe paths.
  - [x] The chat triggers `web_search` and answers with cited snippets.
  - [x] Production: asked “How to use the Vercel AI SDK with tools?” → `web_search` called, answer cited `ai-sdk.dev` / `vercel.com` URLs.

### [P2-20] Agentic tooling upgrades — ZIPs, truncation, filters, get_issue (ES-038, #35)

- **Status**: In Review (2026-10-20) · **Category**: Bug + Feature (Tooling) · **Refs**: Issue #35, ES-038 · **Opened**: 2026-10-20
- **Spec**: `docs/specs/ES-038-agentic-tooling-upgrades.md`.
- **Label note**: the handoff requested **P2-12**, but P2-12 is the completed ES-029 model-router item; renumbered to **P2-20**.
- **Impl**:
  - ZIP entries are returned separately with per-file `data` + `meta`; `entry` selects one file.
  - Per-file truncation metadata: `total_records`, `returned_records`, `truncated`, `truncated_at`, `message`.
  - CSV filters: `start_date`, `end_date`, `filter_column`, `filter_value` (`<`, `<=`, `>`, `>=`, `!=`, exact).
  - All tools now return `{ success, data, meta, error }`; empty results are `success:true, data:[], message`.
  - `get_issue(issue_number)` returns state/labels/body + up to 20 comments.
  - Full reads update the existing note in place; filtered/entry-specific reads are views (`saved:false`) with no duplicate note.
- **Verified (2026-10-20, local)**:
  - ZIP `entries.csv`: 602 rows, 50 returned, `truncated:true`, `truncated_at:"2026-07-26"`; `routines.csv`: 16/16, `truncated:false`.
  - October ZIP + `entries.csv` date filter `2026-10-08`→`2026-10-16`: 30/30 rows, no truncation.
  - `get_issue(16)`: closed, label `yuanying-feedback`, comments returned and summarized.
  - Search all-backend 403: `{ success:false, error:"All web search backends failed: ..." }`.
  - `tsc`, lint, build pass.
- **Verified (2026-10-20, production)**:
  - ZIP `1o5WgYgzSmtjq9sU-eQHIWR8Nt0gAjXvQ`: `entries.csv` 436 rows / 76 returned / `truncated_at:"2026-09-25"`; `routines.csv` 56/56, `truncated:false`.
  - `entries.csv` date filter `2026-10-08`→`2026-10-16`: 30/30 rows.
  - `get_issue(16)` returned closed state, label, body, and comments.
  - Search backend failure contract remains structured.
- **Acceptance**:
  - [x] ZIP multi-file content is not lost.
  - [x] Truncation metadata is accurate.
  - [x] Search failures are errors, not empty success.
  - [x] CSV date/column filters work.
  - [x] Issue status/comments can be queried.
  - [x] Deployed and verified via production chat; owner phone spot-check remains optional.

### [P2-21] New signals — manual_work & body_flag + 21:30 evening check-in (ES-037, #40)

- **Status**: In Review (2026-10-20) · **Category**: Feature (Data Model & UI) · **Refs**: Issue #40, ES-037 · **Opened**: 2026-10-20
- **Spec**: `docs/specs/ES-037-new-signals.md`.
- **Label note**: the handoff requested **P2-13**, but P2-13 is the completed ES-030 Drive item; renumbered to **P2-21**.
- **Impl**:
  - `manual_work` (count; category 园艺/做饭/家务/修理 + optional note).
  - `body_flag` (event; domain 身体/情绪/睡眠 + polarity 不适/良好 + required description).
  - Home quick **动手** / **状态** panels; activity stream labels/details.
  - `evening_checkin` habit: fixed 21:30, merged notification with 收工打卡 / 写反思 / 忽略; actions open PWA `?panel=work|note`.
  - API validation + v5 signal-name constraint + reminder-name constraint.
- **Collector**: `ReminderScheduler.kt` + `MainActivity.java` updated. Release **v1.0.28 (code 29)** built and uploaded to Play internal (`status: completed`): https://github.com/gmyky57ndd-dev/yuanying/releases/tag/v1.0.28
- **Verified (2026-10-20)**: signal API validates both payloads; PWA panels render; web deploy green; Android CI + release workflow green; Play internal shows 1.0.28 / 29 completed. Phone installation/21:30 firing still needs owner confirmation.
- **Acceptance**:
  - [x] Record `manual_work` with category + optional note.
  - [x] Record `body_flag` with domain + polarity + description.
  - [x] 21:30 reminder configured with two action entries + ignore.
  - [x] Ignore/no-repeat semantics preserved by fixed-time dedupe.
  - [ ] Owner installs the new collector build and verifies 21:30 on the phone.

### [P2-22] ZIP top-level truncation semantics (#39)

- **Status**: Done (2026-10-20) · **Category**: Bug (Tooling) · **Refs**: Issue #39, ES-038 · **Opened**: 2026-10-20
- **Fix**: top-level ZIP `truncated` now means "at least one entry was truncated or skipped", with explicit `truncated_entries` and `skipped_entries` arrays. Per-file `meta.truncated` remains authoritative.
- **Verified (2026-10-20, production)**: ZIP with truncated `entries.csv` + complete `routines.csv` returns top-level `truncated:true`, `truncated_entries:["entries.csv"]`, `skipped_entries:[]`, while `routines.csv` has `truncated:false` (56/56).

### [P2-23] Daily summary tone enforcement (ES-039)

- **Status**: In Review (2026-10-20) · **Category**: Prompt/Backend · **Refs**: ES-039, ES-019, ES-027 · **Opened**: 2026-10-20
- **Spec**: `docs/specs/ES-039-daily-summary-tone-enforcement.md`.
- **Impl**: `SUMMARY_TONE_RULES` in `lib/summary-generator.ts` now enforces: start with 1–2 human sentences about state, numbers only as background, no bullet lists, no unsolicited health advice, notes first.
- **Verified (2026-10-20, local)**: “看昨天的简报” returned three prose sentences: notes first, numbers inline, no bullet list, no health advice, ended with “要我把这条存下来吗？”.
- **Acceptance**:
  - [x] Summary request returns no Markdown bullet list.
  - [x] Notes are mentioned before numbers.
  - [x] Tone is calm/warm/concise; no health advice.
  - [x] Production spot-check: “看昨天的简报” returned prose, notes first, numbers inline, no bullet list, no health advice.

### [P2-24] PWA standalone API failures (ES-043)

- **Status**: In Review (2026-10-20) · **Category**: Bug (PWA / Network) · **Refs**: ES-043, ES-040 · **Opened**: 2026-10-20
- **Spec**: `docs/specs/ES-043-pwa-standalone-api-failures.md`.
- **Impl**:
  - `/api/` bypasses the service worker; cache bumped to `yuanying-v3`.
  - SW registered with `updateViaCache: 'none'`.
  - `push_to_dev` result is streamed as a data part; the client alerts on failure.
  - Persisted success/failure uses the verified tool result.
  - Runtime prompt requires 「没发成功」 on failure and forbids invented issue URLs.
- **Verified (2026-10-20)**: `tsc`, lint, build pass; all client API calls use `API_BASE` absolute paths. Production `/sw.js` is v3 and `/api/` bypasses the worker. `push_to_dev` success streamed `success:true` (#46, test issue closed); a forced bad-repo failure streamed `success:false,error:"Not Found"`. Client data-part extraction returns the failure reason.
- **Acceptance**:
  - [x] Browser chat works.
  - [x] `/api/` is not intercepted by the SW (production sw.js v3).
  - [x] `push_to_dev` success and failure data parts verified.
  - [ ] Installed PWA chat + `push_to_dev` on the phone (owner).

### [P2-25] PWA tool-calling stream + timeout hardening (ES-044) — P0

- **Status**: In Review (2026-10-20) · **Category**: Bug (Agentic Loop / PWA) · **Refs**: ES-044, ES-043 · **Opened**: 2026-10-20
- **Spec**: `docs/specs/ES-044-pwa-tool-calling-stream.md`.
- **Impl**:
  - Prompt/manifest force a real `push_to_dev` call after confirmation; text alone cannot claim success.
  - `push_to_dev` streams `sending` / `done` data parts; client shows “⚙️ 正在发送到 GitHub…” and alerts on failure/network error.
  - GitHub API calls have an 8s AbortController timeout; `maxDuration = 60` remains.
  - Persisted success/failure still uses the verified tool result.
- **Verified (2026-10-20, production)**: `push_to_dev` streamed `{status:'sending'}` then `{status:'done',success:true,number:49}` (test issue closed); forced bad-repo failure streamed `success:false,error:'Not Found'`; client extraction confirmed. `tsc`, lint, build pass.
- **Acceptance**:
  - [x] Tool sending/done events are streamed and parsed in production.
  - [x] GitHub calls cannot hang the stream indefinitely.
  - [x] Visible failure/network alerts are wired.
  - [ ] Installed PWA phone test: send an issue, confirm a real issue or visible error.

### [P2-26] Agentic loop freeze + Reset Chat + language toggle (ES-045) — P0

- **Status**: In Review (2026-10-21) · **Category**: Bug (Agentic Loop / PWA) · **Refs**: ES-045, Issue #50 · **Opened**: 2026-10-21
- **Spec**: `docs/specs/ES-045-agentic-loop-freeze.md`.
- **Impl**: no-promise prompt rule; `push_to_dev` sending/done events; Reset button + `POST /api/chat/reset` + reset-aware history; `中/EN` input toggle.
- **Verified (2026-10-21, local + deployed)**: reset flow excluded the prior message; language toggle compiles; tool events wired. Web deploy green. **Acceptance**: [x] prompt rule; [x] reset flow; [x] language toggle; [ ] phone PWA check.

### [P2-27] API timeout + async tool queue (ES-046) — P0

- **Status**: In Review (2026-10-21) · **Category**: Bug (Backend / Vercel) · **Refs**: ES-046, ES-044 · **Opened**: 2026-10-21
- **Spec**: `docs/specs/ES-046-api-timeout-async-tools.md`.
- **Impl**: `maxDuration = 60`; 8s GitHub timeout; 5s sync budget then `agent_jobs` queue fallback; queue processed by the PWA reminder poll; 504/network error mapping; maxSteps 3.
- **Verified (2026-10-21, local + deployed)**: queued job processed via `/api/reminder/due` → issue #51 (test issue closed); GitHub timeout/504 mapping present. Web deploy green. **Acceptance**: [x] timeout guards; [x] async queue; [x] visible queued/error states; [ ] phone PWA check.

### [P2-28] Agent tools — write_markdown & scheduler (ES-047)

- **Status**: In Review (2026-10-21) · **Category**: Feature (Tooling / Safety) · **Refs**: ES-047, Issue #50 · **Opened**: 2026-10-21
- **Spec**: `docs/specs/ES-047-write-markdown-scheduler.md`.
- **Impl**: allowlisted `write_markdown` via GitHub Contents API commit; `scheduler(HH:MM, action)` creates a `scheduled_message` reminder (max 3 pending).
- **Verified (2026-10-21, local + deployed)**: write path guards reject traversal/non-allowlisted paths; scheduler created a 21:30 reminder (test reminder removed). Web deploy green. **Acceptance**: [x] path whitelist/validation; [x] limits; [ ] owner confirms a real write/reminder.

### [P2-29] Automated regression tests for ES-039/043–047

- **Status**: Done (2026-10-21) · **Category**: Chore (Testing) · **Refs**: ES-039, ES-043–ES-047 · **Opened**: 2026-10-21
- **Impl**: `npm test` (Node test runner), 23 tests across CSV/JSON/ZIP parsers, GitHub read-back, SSE data parts/504, `write_markdown`, scheduler timezones, prompt/SW/manifest regression guards.
- **CI**: `.github/workflows/tests.yml` runs tests + lint + typecheck on push/PR.
- **Runbook**: `docs/runbooks/tests.md`.
- **Verified (2026-10-21)**: 23/23 tests pass locally; GitHub Actions **Tests** run `39612470879` green; web deploy run `39612470889` green.

### [P2-30] First manifestation — avatar stage + voice (ES-040)

- **Status**: In Review (2026-10-21) · **Category**: Feature (Phase C) · **Refs**: ES-040, Issue #54 · **Opened**: 2026-10-21
- **Spec**: `docs/specs/ES-040-first-manifestation.md`.
- **Impl**: `AvatarStage` at 60vh (collapsible); idle/thinking/speaking/listening animations; hold-to-talk STT; auto-TTS with 声/静 toggle; stage nav. Placeholder avatar image pending the owner's Live2D/VRM asset.
- **Verified (2026-10-21, deployed)**: web deploy green; stage/voice/TTS code compiles and ships. **Acceptance**: [x] stage; [x] hold-to-talk; [x] TTS; [x] animation states; [ ] Live2D/VRM model swap; [ ] phone visual/voice check.

### [P1-61] PWA client restore + collector status/update (Issue #54)

- **Status**: In Review (2026-10-21) · **Category**: Bug/Feature (PWA Ops) · **Refs**: Issue #54 · **Opened**: 2026-10-21
- **Runbook**: `docs/runbooks/pwa-client-restore.md`.
- **Impl**: Settings shows collector version + last report; `/api/collector/status` compares the latest GitHub release; update button opens Play internal testing; **添加到主屏幕** install prompt/instructions; collector heartbeat + v1.0.29.
- **Verified (2026-10-21, production)**: `/api/collector/status` reports installed **v1.0.29 (30)**, last report `2026-10-21T15:06:22Z`, latest `1.0.29`, no update needed. Collector v1.0.29 (code 30) is completed on Play internal; GitHub release assets available. **Acceptance**: [x] runbook; [x] version/last report UI; [x] update prompt; [x] add-to-home path; [ ] owner restores icon and confirms a signal.

### [P3-01] Collector as hub & PWA lifesaver (ES-048)

- **Status**: In Review (2026-10-21) · **Category**: Architecture / Android Client · **Refs**: ES-048, Issue #54, Issue #56 · **Opened**: 2026-10-21
- **Spec**: `docs/specs/ES-048-collector-hub.md`.
- **Impl**: Collector **启动元婴** launchpad with WebAPK detection/restore dialog; `OverlayService` (draggable bubble + quick note input) and overlay switch; heartbeat `overlay_active`; Settings online/overlay/PWA version; collector/PWA update prompts; server sync request + 15-min `SyncCheckWorker`.
- **Verified (2026-10-21, production)**: collector v1.0.30 (code 31) completed on Play internal; `/api/collector/status` shows installed 1.0.29 → latest 1.0.30 with `update_available:true`, online true, overlay false. Web deploy, Tests, and Android CI green. **Acceptance**: [x] launchpad; [x] overlay; [x] health/version UI; [x] update prompts; [x] sync request; [ ] owner phone verification.

### [P1-62] Server-triggered sync + tool-result brevity + language toggle (Issue #56)

- **Status**: In Review (2026-10-21) · **Category**: Bug/Feature (Ops/UI) · **Refs**: Issue #56 · **Opened**: 2026-10-21
- **Impl**: `collector_sync_requested_at` + **立即同步采集器** + `SyncCheckWorker` (15-min WorkManager limit); prompt/manifest “summarize tool results, do not read back full docs by default”; language toggle now focuses the input and changes the placeholder, while OS keyboard language remains system-controlled.
- **Verified**: sync request marker + 15-min `SyncCheckWorker`; prompt/manifest brevity rule; language toggle focus/placeholder. Production Settings shows the update prompt. **Acceptance**: [x] sync request path; [x] tool-result brevity rule; [x] language toggle UX; [ ] true <30s sync requires FCM (documented).

### [P3-02] Desktop PWA responsive layout (ES-049)

- **Status**: In Review (2026-10-21) · **Category**: UI/UX (Responsive) · **Refs**: ES-049 · **Opened**: 2026-10-21
- **Spec**: `docs/specs/ES-049-desktop-pwa-layout.md`.
- **Impl**: `md:` two-column grid (`280px` sidebar + `max-w-[700px]` chat), overall `max-w-6xl mx-auto`; vertical habit list; desktop avatar/status header; larger chat text; language toggle hidden on desktop; independently scrolling sidebar.
- **Verified (2026-10-21)**: web deploy green; classes/bundles ship. **Acceptance**: [x] centered max width; [x] habits left / chat right; [x] larger text; [x] language toggle hidden; [ ] Mac PWA visual check.

### [P3-03] PWA version awareness + SW update (ES-050)

- **Status**: Done (2026-10-21) · **Category**: Bug (Self-Awareness / Update) · **Refs**: ES-050 · **Opened**: 2026-10-21
- **Spec**: `docs/specs/ES-050-pwa-version-awareness.md`.
- **Impl**: `next.config.mjs` injects `NEXT_PUBLIC_APP_VERSION`; Settings shows PWA version; runtime Body Status distinguishes LLM/PWA/Collector; SW update prompt + cache v4; `/api/health` no-store alias; Settings uses no-store.
- **Verified (2026-10-21, production)**: `/sw.js` is v4; `/api/health` returns `Cache-Control: no-store`; “你是什么版本？” answered PWA v0.1.0, LLM deepseek-chat, collector v1.0.29 (latest v1.0.30 available). Web deploy + tests green. **Acceptance**: [x] PWA version injection; [x] version answer context; [x] SW prompt; [x] collector status no-store; [ ] owner phone/Mac update-prompt check.

### [P3-04] Config-driven tool readback / silent mode (ES-051)

- **Status**: In Review (2026-10-21) · **Category**: Feature (Agent Config) · **Refs**: ES-051 · **Opened**: 2026-10-21
- **Spec**: `docs/specs/ES-051-tool-readback.md`.
- **Impl**: `tool_readback_enabled` config (default false); Settings toggle; `lib/tool-result.ts` silent normalization + 800-char verbose cap; chat prompt silent/verbose injection; long assistant replies collapse with 展开全文.
- **Verified (2026-10-21, production)**: silent `get_notes` returned `count:5` + 80-char titles only; the reply summarized the notes without dumping full text. `tool_readback_enabled` defaults false; Settings toggle persists. **Tests**: `lib/tool-result.test.ts` + full suite 28/28.
- **Acceptance**: [x] default silent; [x] Settings toggle; [x] normalized results; [x] 800-char cap; [x] frontend collapse; [ ] owner real push/verbose check.

**Phase C overall**: PR #17 merged to main; `tsc`, lint, and build pass. Feedback status badges were already delivered in ES-023. No new capture surfaces.

---

## In Review

### [P2-01] Opinions file structure + schema

- **Status**: In Review · **Category**: Feature · **Refs**: ES-006 §5; commit `46acf06`
- **Notes**: `core/opinions/{held,confirmed,rejected,archive}.md` created with the entry format (id, Confidence, First observed, Last engaged, Topic, Evidence).

### [P2-02] Detector 1 — avoidance via adjacent tasks

- **Status**: In Review · **Category**: Feature · **Refs**: ES-006 §4; `scripts/opinions.mjs` (`npm run opinions:detect`)
- **Notes**: Runs as an **agent batch** (core/opinions files are read-only on the serverless runtime — writes are committed). Requires 5+ consecutive note-days **and** adjacent activity (false-positive guard); max 3 held (oldest → archive); topic heuristic; off-limits filter. Nightly scheduling is the agent/cron invoking the script.

### [P2-03] Confirmation protocol + file transitions

- **Status**: In Review · **Category**: Feature · **Refs**: ES-006 §7; `npm run opinions:respond <id> 对|不对|有可能 [reason]`
- **Notes**: 对 → `confirmed.md`; 不对 → `rejected.md` (+reason, never re-proposed); 有可能 → confidence +0.1; silence → −0.05/week, 60 days → `archive.md`.

### [P2-04] Prompt integration — confirmed + held opinions

- **Status**: In Review · **Category**: Feature · **Refs**: ES-006 §8; `lib/yuanying.ts`
- **Notes**: `confirmed.md` always; `held.md` only when the conversation topic matches; `rejected.md`/`archive.md` never. Prompt line + "we" voice + priority order (ground rules > opinions; confirm-before-action > all).

### [P2-05] Off-limits filter from ground rules

- **Status**: In Review · **Category**: Feature · **Refs**: ES-006 §10; `lib/opinions.ts` + detector filter
- **Notes**: Reads `## No opinions about` from `core/ground-rules.md`; **hard filter** (not a threshold). Owner populates over time; empty filter acceptable for v1 (non-blocking).

### [B-21] Steps signal diagnostic (value 0 vs summation bug) `[BUG]`

- **Status**: In Review · **Phase**: P0 · **Opened**: 2026-10-16 · **Refs**: ES-007 §3; commit `44dbc35`
- **Diagnostic** (logged per §3): today's snapshots were `723` then `0` — **some value > 0 but summary showed 0 → aggregation bug** (not a total HealthConnect failure).
- **Fix**: summary uses the **max snapshot** of the day (`pickDailySteps`/max). Applied (ES-005 §E.3); see **P1-23**.
- **Source mismatch (escalated, no code change)**: HealthConnect values (0/723) are far below the Fit app (~6k) → likely source/counter-scope mismatch; **reported to owner** for the same-source check ("matches Fit within 10%").
- **Re-diagnosed (2026-10-16, ES-009 §5)**: home shows `步骤 0` while yesterday shows `2809`. Query of today's rows: all **7** `steps` signals for the local day are `value=0` (16:56–18:24 UTC). So aggregation (max) is correct — the current day's **collection** is 0. Yesterday's rows: `723`, `0`, `2809` → max `2809`. Conclusion: **not** an aggregation bug; the collector's HealthConnect read returns 0 for the current day → **collection/source** issue, escalated.
- **Moved** from Backlog to Bug per Work Order §5.2.

### [B-23] Note saved twice on submit `[BUG]`

- **Status**: In Review · **Category**: Bug · **Opened**: 2026-10-17 · **Refs**: ES-012 §1
- **Report**: two identical notes are saved every time.
- **Diagnosis** (DB, 2026-10-17): duplicate pairs with identical text ~0.75–0.93s apart (ids 482/483, 470s) → a double submit; the save button had no in-flight guard.
- **Fix**: client `noteSaving` guard (disable + "保存中…"); server dedupe — an identical note inserted within 5s returns the existing row.
- **Verified (2026-10-17, prod)**: two identical POSTs within 5s → second returned `{deduped:true, id:484}`; only **1** row created (test row deleted).
- **Remaining**: owner device check.

### [B-24] Chat messages vanished after 10:20pm `[BUG]`

- **Status**: In Review · **Category**: Bug · **Opened**: 2026-10-18 · **Refs**: issue #11
- **Diagnosis**: the messages were in the DB (ids 82–91). `/api/history?today=1` ordered **ascending** + `limit=50`; Oct 17 had **58** messages, so it returned the **oldest 50** and dropped the newest 8. Every send reloaded and replaced the UI with that page.
- **Fix**: query newest-first then reverse; add the product-day upper bound; `loadMessages` no longer wipes the view on a server error.
- **Verified (2026-10-18, prod)**: `/api/history?limit=5` returns ids 91–95 (newest); `/api/history?today=1` returns today's 4.

### [P1-16] Voice pass — 元婴 speaks, not reports

- **Status**: In Review
- **Category**: Bug (voice violated core/voice.md)
- **Refs**: ES-005 §E.1; commit `c7c4af7`
- **Notes**: `core/voice.md` "When reporting data" section + system-prompt rule. Acceptance: chat to "看今天简报" starts with a sentence; no Signals/Totals/Reminders bullets; numbers inside sentences. **Spot-check 2026-10-15:** reply led with a label ("今天：") — rule is in the prompt but the model still drifts; owner to confirm, may need prompt tightening (no separate task yet).

### [P1-17] Reminder cadence — quiet window, 2h standup, cap 6/day

- **Status**: In Review
- **Category**: Bug (9/day violated quiet-by-default)
- **Refs**: ES-005 §E.2; commit `de6bab5`; collector v1.0.15
- **Notes**: TS scheduler quiet window + daily cap 6 + 60-min miss sweep; collector daily cap 6 (quiet window already); standup habit interval 60→120; `reminders.missed_at` added.

### [P1-18] Weekly digest endpoint

- **Status**: In Review
- **Category**: Feature
- **Refs**: ES-005 §E.4; commit `209ab4e`
- **Notes**: `GET /api/digest/week` + `lib/digest-generator.ts`; prose (not fields); stored in `summaries` with `type='week'`.

### [P1-19] Ground rules file + prompt integration

- **Status**: In Review
- **Category**: Feature
- **Refs**: ES-005 §E.5; commit `c7c4af7`
- **Notes**: `core/ground-rules.md` seeded (owner edits over time, non-blocking). Loader handles present/empty/missing (warn once). Priority-order block in prompt.

### ES-005 §E.3 — Steps diagnostic (recorded)

- **Result**: **aggregation bug** (not a total HealthConnect failure). Today's `steps` snapshots: `723` then `0`; the summary used "last" → showed 0. Fix: max-of-day snapshot (`lib/summary-generator.ts`). Acceptance: today's steps reflect the day's max snapshot; steps line and summary agree.

### [P0-01] Remove `sit` button and signal

- **Status**: In Review · **Phase** P0 · **Refs** spec v2 §5; commit `6b8ffac`
- **Acceptance**: UI = wake/sleep/water; API rejects `sit`; schema constraint updated; no `sit` literals.
- **Notes**: v2 migration applied; `v2_signal_name` NOT VALID (historical sit row retained, AGENTS §3 historical records). Production check: `sit → 400` verified. Owner UI check pending.

### [B-15] app_usage `duration_min` inflation `[BUG]`

- **Status**: In Review · **Phase** P0 · **Refs** commits `a71c996`, `2f3fdf3`
- **Description**: ROM returns cumulative foreground totals (e.g., 653 min in a 60-min window).
- **Fix**: v1.0.5 clamp + v1.0.6 per-window deltas via `UsageEvents.queryEvents()`.
- **Acceptance**: all rows ≤ 60 after 2 hourly batches. **Clean-data cutoff** = v1.0.6 collector deploy timestamp (record on device deploy).

### [B-16] water count accumulates across days `[BUG]`

- **Status**: In Review · **Phase** P0 · **Refs** AGENTS §6, APPENDIX B; commit `473a005`
- **Description**: Water (and other daily) counts included previous days; server "today" used UTC and the client re-filtered by browser timezone.
- **Fix**: `lib/timezone.ts` (`getTodayRange`/`getDayRange`, `config.timezone`); applied to `/api/signal` (GET+POST idempotency), `/api/chat`, `/api/steps`; removed client `toDateString()`; removed duplicate `/api/summary`.
- **Acceptance**: unit test passes (day range crosses UTC at 16:00); no `setHours(0,0,0,0)`/`toDateString()` in `app|lib`; **owner confirms reset across a real local midnight** (pending).
- **Blocks**: P1-11.

### [B-17] button/summary inconsistency `[BUG]`

- **Status**: In Review · **Phase** P0 · **Refs** `docs/PM/PM Feedback — 2026-10-14.md` §2.4; commit `56a0762`
- **Description**: Signal buttons read live `/api/signal` while the chat summary read a cached `summaries` row that never refreshed → buttons showed `wake` active / `water ×1` but the summary showed `起床: 未记录` / `喝水: 0/6`.
- **Evidence**: `summaries` row `updated_at 2026-10-14T18:38:34Z` (wake null, water 0) while `wake`/`water` signals were written `19:16Z` (same Beijing day).
- **Fix**: `getTodaySummaryCached` now regenerates when the cached row is older than the newest signal/reminder of the day.
- **Acceptance**: summary matches buttons after new signals; owner confirms on device.
- **Blocks**: P1-14.

### [B-18] 元婴 states inference as fact `[BUG]`

- **Status**: In Review · **Phase** P0 · **Refs** `docs/PM/PM Feedback — 2026-10-14.md` §2.5; commit `a184e33`
- **Description**: 元婴 said "…有一串 app_usage。十九次。没睡。" — diagnosing instead of observing (learning loop step 3).
- **Fix**: authored rule in `core/voice.md` (观察，不诊断) + runtime reinforcement in `lib/yuanying.ts` (propose, never conclude).
- **Acceptance**: 元婴 presents inferences as questions, not facts; owner confirms.

### [P0-02] Signal button silent failure

- **Status**: In Review · **Phase** P0 · **Refs** diagnostic F1; commit `89a8f04`
- **Notes**: Optimistic update + visible errors + absolute URLs; SW v2 network-first. Verified by agent in a clean browser; owner on-device confirmation pending.

### [P0-03] Signal definitions in system prompt

- **Status**: In Review · **Phase** P0 · **Refs** diagnostic F2; commit `89a8f04`
- **Notes**: Definitions + no-fabrication rule; verified via production `/api/chat`.

### [P0-04] 元婴 fabrication of button meanings

- **Status**: In Review · **Phase** P0 · **Refs** diagnostic F2
- **Notes**: Awaiting owner sign-off (behavior confirmed earlier in chat).

### [P1-04] `/api/reminder/due` + `/act`

- **Status**: In Review · **Phase** P1 · **Refs** spec v2 §4.2; commit `899c8a1`
- **Notes**: Verified in production (401/200, `{reminders:[]}`). Will be consumed by the collector in P1-09.

### [P1-05] Reminder settings toggles

- **Status**: In Review · **Phase** P1 · **Refs** spec v2 §6.4; commit `f4e40e0`
- **Notes**: `/settings` renders the 3 toggles backed by `config.reminders_enabled`.

### [P1-06] HealthConnect step collection (Android)

- **Status**: In Review · **Phase** P1 · **Refs** spec v2 §7/App B; commits `75b243d`, `8dbb240`
- **Notes**: v1.0.8 keeps **minSdk 24** via `tools:overrideLibrary` + `SDK_INT>=26` gate (Play blocked the minSdk-26 reduction). Steps work on Android 9+. **Device verification pending.**

### [P1-07] `/api/steps`

- **Status**: In Review · **Phase** P1 · **Refs** spec v2 App B.8; commit `d4111d1`
- **Notes**: POST/GET verified; GET now uses `getTodayRange` (B-16).

### [P1-08] Reference reminders + steps in chat

- **Status**: In Review · **Phase** P1 · **Refs** spec v2 §6.3/§7; commit `cc952f3`
- **Notes**: `buildSystemPrompt` includes steps/water/recent reminders; now day-scoped via B-16.

### [P1-09] Reminder generation + delivery in Android collector

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: `docs/Dev Response 1014.md` §2.1; commit `c7ef80c`
- **Description**: Collector WorkManager job decides due reminders (Beijing windows), records them via `POST /api/reminder/create`, then shows a notification + Chinese TTS. No cron, no PWA-open requirement.
- **Acceptance**:
  - [x] Collector checks water/standup/vitamin windows hourly
  - [x] Notification + TTS fire without the PWA open (code path)
  - [x] Writes `reminders` rows (shown/acted) for the summary
  - [x] Respects `config.reminders_enabled`
  - [ ] Owner confirms on device
- **Notes**: Kotlin; minSdk 24; `POST_NOTIFICATIONS` requested on Android 13+. iOS deferred (P2). Replaces P1-02. **Device verification pending.** Build v1.0.9 (code 10).

### [P1-10] Steps display on PWA home

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: `docs/Dev Response 1014.md` §2.3; commit `832fcc8`
- **Description**: Show today's steps + goal on the PWA home (reads `/api/steps`).
- **Acceptance**:
  - [x] Home shows `steps / goal`
  - [x] Updates after a step report / reload (refresh on load + on foreground)
  - [x] Honors daily scoping (B-16)
- **Notes**: Verified in production — home renders `步数 0 / 5000`. Owner device check pending.

### [P1-11] Daily summary v1

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: `docs/APPENDIX for 1014 response.md` Appendix A; commit `5a276c4`
- **Description**: Aggregate the day's signals + reminders into a `summaries` row (aggregation only). `POST /api/summary/generate`, `GET /api/summary/today`; chat "看今天的简报".
- **Acceptance**:
  - [x] `summaries` table created
  - [x] generate endpoint idempotent (upsert)
  - [x] `today` caches on hit, generates on miss
  - [x] empty day produces a record
  - [x] cross-day boundary per user timezone
  - [x] chat "看今天的简报" works
- **Notes**: Verified in production (generate → cached `today`; chat returns the formatted brief). Supersedes the deleted `/api/summary`.

### [P1-12] Configurable habits

- **Status**: In Review
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: `docs/specs/ES-001-habits-framework.md` (approved 2026-10-15); commit `0675e78`
- **Description**: Configurable habits (minimal). v1 = **passive** new habits only; read-only administration; reminder rules support fixed times + per-day intervals (§3.1 tick semantics); the collector reads server config.
- **Acceptance**:
  - [x] Forward migration + idempotent seed (water/standup/vitamin)
  - [x] `GET /api/habits` read-only; no new public write endpoints (ES-004 gate)
  - [x] Collector evaluates fixed/interval rules with §3.1 semantics (tick, no backfill, dedup)
  - [x] Authored templates + optional `text_override`/`voice_override`
  - [x] Settings read-only 管理习惯 list
  - [ ] Owner device verification (collector v1.0.10)
- **Notes**: Web deployed; collector **v1.0.10** (code 11) pending Play upload + device check. v1.1 (manual habits + dynamic buttons) gated on ES-004.

---

### [P1-21] Summary window — 今天 = last completed day

- **Status**: In Review · **Category**: Bug · **Refs**: ES-007 §1 · **Opened**: 2026-10-16
- **Problem**: home summary + 今天 panel showed the current *incomplete* day (before 18:00 it leaked partial data).
- **Spec**: before 18:00 local → **yesterday** (label 昨天); 18:00–24:00 → **today** (label 今天); after 00:00 → **yesterday**.
- **Impl**: `getDisplayDay(tz)` in `lib/timezone.ts`; `getDisplaySummary()` in `lib/summary-generator.ts` returns `{...summary, label}`; `/api/summary/today` + `/api/chat` use it; panel header renders the label.
- **Verified (2026-10-16, prod)**: `GET /api/summary/today` → `date=2026-10-15, label=昨天` (tz `America/New_York`, before 18:00).
- **Remaining**: owner confirms the label flips at 18:00 on device.

### [P1-23] Steps — window/source diagnostic `[REOPENED · P0]`

- **Status**: In Progress · **Priority**: P0 · **Category**: Bug · **Refs**: ES-007 §3; [B-21] · **Reopened**: 2026-10-16
- **Correction (owner, 2026-10-16)**: the mismatch is **not** summation across sources. Fit and Watch are **independent** and both ≈ truth; **HealthConnect-via-元婴 is the outlier**.
- **Earlier partial fix (kept)**: `pickDailySteps` / `GET /api/steps` use the day's **max snapshot** (still correct for the `723→0→2809` pattern) — but it does **not** explain why HC-via-元婴 disagrees with Fit/Watch.
- **Diagnostic (required; logged 2026-10-16)** — window / sources / per-source count / aggregation mode:
  - **Window**: `context.window_start = 2026-10-16T00:00:00Z` → **UTC midnight**, not the device's local midnight. `StepsCollector` uses `Instant.now().truncatedTo(ChronoUnit.DAYS)` (UTC). On `America/New_York` the window `[UTC 00:00, now)` starts ~20:00 the prior local evening → includes ~4h of yesterday's steps.
  - **Aggregation mode**: `sum_all_origins` — `readRecords(StepsRecord)` with **no DataOriginFilter**, summing `record.count` across every origin present (phone + watch + Fit can all contribute).
  - **Sources / per-source count**: **not previously captured**. DB rows are all `source='passive'` (14 rows / 5 days; values `0`…`2809`). HealthConnect per-origin counts were unavailable.
- **Instrumentation added (diagnostic only; no value change)**: collector `StepsCollector` now sends `sources` (`{package, steps, count}` per HealthConnect data origin), `sources_count`, and `aggregation`; `POST /api/steps` persists them in `context`. `value` is unchanged.
- **Fix (2026-10-16)**: `StepsCollector` now anchors the window to **local midnight** in the device timezone (`LocalDate.now(zone).atStartOfDay(zone)`), not `Instant.now().truncatedTo(DAYS)` (UTC). This stops ~4h of the previous local evening leaking into the day. **Aggregation is unchanged** (owner: the problem is *not* summation across sources). Collector **v1.0.21 (code 22)**.
- **Display cutoff (2026-10-16)**: the day value is the **max** snapshot, so an already-stored inflated reading would persist. `pickDailySteps` + `GET /api/steps` now **prefer rows tagged `context.timezone`** (collector v1.0.21+ = corrected local window); legacy UTC-window rows are preserved for audit but excluded once a corrected row exists (clean-data cutoff, AGENTS §3).
- **ES-011 §3 provenance (2026-10-16)**: steps `context` now also carries `source` (`merged`), `aggregation` (`sum`), and `raw_value`, alongside `window_start`/`window_end`/`timezone`/`sources`. Collector **v1.0.22 (code 23)**.
- **Fix (issue #8, 2026-10-17)**: per-origin data proved double counting — Fit `4054` + HC-phone `4317` = `8371`. Collector now takes **max per origin** (`aggregation: max_per_origin`; `raw_value` = raw sum), so it reports ~`4317`. Collector **v1.0.27 (code 28)**.
- **Verified (2026-10-17)**: release run green; Play internal `completed` (code 28). Open issues #2/#3/#5/#6/#7/#8 all commented + closed (3/5/6 duplicate/completed; 8 fixed).
- **Display cutoff (2026-10-17)**: home/summary now prefer rows with `aggregation='max_per_origin'` (then `context.timezone`, then legacy). This stops the old `sum` row (8371) from overriding the corrected `max_per_origin` row (4595) via the max-snapshot rule.
- **Display verified (2026-10-17, prod)**: `/api/steps` and `/api/summary/today` now return **4595** (max_per_origin row #524), not 8371 (old `sum` row #506).
- **Deploy**: collector **v1.0.20 (code 21)** (instrumented) → **v1.0.21 (code 22)** (local-midnight window fix) + web `/api/steps`.
- **Verified (2026-10-16)**: Play internal `completed` (versionCode 22); GitHub Release `v1.0.21`; web `/api/steps` live. Production still shows the pre-fix value (`2700`) until the phone runs v1.0.21 and posts a corrected row — then the cutoff switches the day value to the local-day reading.

### [P1-24] Action model — unify counters

- **Status**: In Review · **Category**: Feature · **Refs**: ES-007 §4
- **Impl**: `SummaryData` gains `standup {count,target}` and `vitamin {done,at}`; summary + "今天" panel show 喝水 x/6, 起身 x/8, 维生素 ✓ HH:MM; `/api/reminder/act` writes `context.habit` and, for water, a single `water` action (reminder action = manual action). Prompt line updated.
- **Verified (2026-10-16, prod)**: `/api/summary/today` returns `standup:{count,target}` and `vitamin:{done,at}`.

### [P1-25] Reminder notification action buttons

- **Status**: In Review · **Category**: Feature · **Refs**: ES-007 §4
- **Impl**: collector notification now has a habit action (water 喝了 / standup 起身了 / vitamin 吃了) + 忽略; `ReminderActionReceiver` maps acted→`acted`, ignore→`dismissed`; acted opens the app, ignore stays quiet.
- **Verified (2026-10-16)**: Android Collector CI build green (run `38929058636`, debug-APK artifact). Collector **v1.0.17 (code 18)** released (tag `v1.0.17`) — signed AAB/APK GitHub Release + **Play internal upload succeeded**.
- **Remaining**: device verification (install internal build, confirm habit action + 忽略); PWA fallback = open modal.

---

### [P1-27] History tab — day list + detail

- **Status**: In Review · **Category**: Feature · **Refs**: ES-008 §2.2 · **Opened**: 2026-10-16
- **Impl**: new page `/history` (day list newest-first; tap → day detail) backed by `GET /api/history/days`, `GET /api/history/day?date=`, `GET /api/history/search?q=`. Detail shows signals with timestamps, notes, reminders fired + responses, that day's conversation, and the stored prose summary. Search by date (jumps to the day) and by note keyword. Cloud-first (per request, nothing cached on the phone). Home links to 历史.
- **Verified (2026-10-16, prod)**: `/api/history/days` → 4 days; `/api/history/day?date=2026-10-15` → 61 signals / 2 notes / 15 reminders / 10 messages + stored summary; `/api/history/search` date + keyword both work.
- **Remaining**: owner device check.

### [P1-28] Note capture — free text, no metadata

- **Status**: In Review · **Category**: Feature · **Refs**: ES-008 §2.3
- **Impl**: note capture already complies — free-text field + optional mic, no dropdowns/tags/required fields; `POST /api/note` stores `{text}` only. Notes are now surfaced and searchable in History (§2.2). 元婴-side structure remains in ES-006 Detector 1 (not a user action).
- **Verified (2026-10-16, prod)**: note keyword search returns matches from `/api/history/search`.
- **Remaining**: owner device check.

---

### [P1-26] Home redesign — activities + chat only

- **Status**: In Review · **Category**: Feature · **Refs**: ES-008 §2.1 (revised by ES-009 §1)
- **Impl**: home is today-only — avatar, signals, steps, 记一笔, a raw **今天** activity stream, and chat. The ES-007 今天/昨天 summary panel and the `自动 X · 手动 X · 提醒 X` line are removed (no summary/historical data on home). Delivered with **P1-30**.
- **Remaining**: owner device check.

### [P1-29] Move settings off home

- **Status**: In Review · **Category**: Feature · **Refs**: ES-008 §2.1 (revised by ES-009 §1)
- **Impl**: settings are reachable only via a corner nav link; the inline home summary panel (the last summary surface on home) is gone. No settings controls render on home.
- **Remaining**: owner device check.

### [P1-30] Home = today only, remove 昨天 panel

- **Status**: In Review · **Category**: Bug · **Refs**: ES-009 §1
- **Impl**: removed the summary panel from home (今天/昨天 header + the `自动·手动·提醒` line + the reminder group). Added a raw today activity stream via new `lib/activity-stream.ts` (`buildActivityStream`) with an empty state ("今天还没有记录。"). Home no longer reads the display-day summary at all.
- **Remaining**: owner device check; supersedes the ES-007 §1 pre-18:00 "昨天" label on home.

### [P1-31] Chat scoped to today

- **Status**: In Review · **Category**: Bug · **Refs**: ES-009 §1
- **Impl**: `/api/history?today=1` filters messages to the current product day (`getTodayRange`); home loads that on mount, so the chat never scrolls before 00:00 local. Earlier days remain available in History.
- **Verified (2026-10-16, prod)**: home `/` → 200; home no longer fetches/renders the display-day summary panel or the `自动·手动·提醒` line.
- **Verified (2026-10-16, prod)**: `/api/history?today=1` → `{messages:[]}` (today empty); `/api/history` → 22 (earlier days intact for History).
- **Remaining**: owner device check.

### [P1-32] Notes expandable inline

- **Status**: In Review · **Category**: Bug · **Refs**: ES-009 §3
- **Impl**: note rows in the home **今天** stream and the History 活动 stream are tap-to-expand inline (full text wraps; tap again collapses). No separate note view. Fixes the "notes added but not viewable" triage item.
- **Verified (2026-10-16)**: build/typecheck green; expand/collapse via UI state (device check pending).
- **Remaining**: owner device check.

### [P1-33] History app_usage grouping

- **Status**: In Review · **Category**: Bug · **Refs**: ES-009 §2
- **Impl**: History detail renders the shared activity stream — contiguous `app_usage` windows roll into **应用会话 (约 Xh, N 应用)** rows (tap to expand apps sorted by minutes); steps rows with value 0 / no change are hidden.
- **Verified (2026-10-16)**: build/typecheck green; grouping via `buildActivityStream` (device check pending).
- **Remaining**: owner device check.

### [P1-34] Summary counter unification (ES-007 §4 completion)

- **Status**: In Review · **Category**: Bug · **Refs**: ES-009 §2; ES-007 §4
- **Impl**: History 概要 top line now shows **habit counts** only — 起床 · 入睡 · 喝水 x/6 · 起身 x/8 · 维生素. The `提醒 0/N` counter is removed from the summary and moved to a collapsed **提醒记录 (audit)** subsection.
- **Verified (2026-10-16)**: build/typecheck green; 概要 built from stored summary habit counts (device check pending).
- **Remaining**: owner device check.

---

### [P1-37] Note language bug on web

- **Status**: In Review · **Category**: Bug · **Refs**: ES-012 §1 · **Opened**: 2026-10-16
- **Reproduction (logged first)**: all 5 stored notes are **Latin-only** (0 CJK/JP/KR). Owner note #349: *"The switch language does not work."* → the on-device keyboard/IME cannot switch to Chinese while composing in the PWA. Exact browser + steps still needed from the owner (ES-012 §1 checklist); no device here.
- **Ranked causes** (ES-012 §1): inputMode/autoComplete · missing CJK glyphs · controlled-input composition · PWA standalone IME.
- **Fix applied (defensive, addresses #1/#3)**: note textarea + chat input set `lang="zh-CN"`, `inputMode="text"`, `autoComplete/autoCorrect/autoCapitalize="off"`, `spellCheck={false}`, `onCompositionEnd` sync.
- **Verified (2026-10-16)**: build/typecheck green; note + chat inputs updated. Owner device verification pending on the failing browser.
- **Remaining**: owner verifies on the failing browser; if still broken, test browser (non-standalone) vs installed PWA to isolate cause #4.

### [P1-36] 元婴 self-diagnostic response

- **Status**: In Review · **Category**: Bug (voice) + Feature (provenance) · **Refs**: ES-011
- **Voice**: `core/voice.md` gains "When something is wrong" (query own data → state what you see → what you cannot see → propose **one** direction; never a menu / never "你确认一下").
- **Provenance**: steps signal logs `source`, `window_start`, `window_end`, `aggregation`, `raw_value` (ES-011 §3); the chat prompt now receives steps provenance so 元婴 can state it.
- **Governance**: `AGENTS.md` §5.1 bullet 7 (signal provenance) + **v1.6**.
- **Verified (2026-10-16)**: `core/voice.md` + `AGENTS.md` v1.6 committed; collector **v1.0.22 (code 23)** Play internal `completed` (provenance fields). Owner to confirm a discrepancy reply follows §4.
- **Remaining**: owner confirms a discrepancy reply follows §4 (no menu).

### [P1-38] Note tags — auto-derived, visible, editable

- **Status**: In Review · **Category**: Feature · **Refs**: ES-012 §2
- **Impl**: `lib/tags.ts` extractor (open vocabulary — words from the note + existing tags; no model call). Tags stored in note `value.tags` on save; shown under the note (home 今天 stream + History detail); editable (remove ×, add ＋); History search matches text **or** tag (`/api/history/search`); `PATCH /api/note/[id]`.
- **Verified (2026-10-16)**: prod `/api/note` extracts + stores tags; History search matches text **or** tag. Device check pending.
- **Remaining**: owner device check; tag autocomplete is a simple prompt for now.

### [P1-39] Feedback loop — notes → PM inbox

- **Status**: In Review · **Category**: Feature · **Refs**: ES-012 §3
- **Impl**: `value.feedback` flag; heuristic proposal on likely-feedback notes ("这像反馈，标记?"); **Feedback Inbox** page `/feedback` (small link on home, not a new tab); [promote] sets `value.promoted`, [dismiss] clears the flag (`PATCH /api/note/[id]`); `npm run inbox` drafts `docs/pm/inbox/YYYY-MM-DD.md`. One-way owner → dev; **never** writes TRACKING.
- **Verified (2026-10-16)**: `/feedback` (200) + `/api/feedback` (`{items:[]}`) live; `npm run inbox` runs (no promoted notes yet). Device check pending.
- **Remaining**: owner device check; weekly promote review.

### [P1-35] AI session capture — manual + folder (v1)

- **Status**: In Progress · **Category**: Feature · **Refs**: ES-010
- **Impl**: PWA `share_target` (`/import`, GET title/text/url prefill) + `POST /api/sessions` (stores a `session` signal with auto-tags); desktop folder import via `npm run import` normalizes `~/yuanying/imports/conversations/*.md` into `core/memory/conversations/YYYY-MM-DD-<slug>.md` (standard record format, ES-010 §5).
- **Verified (2026-10-16)**: `/import` (200) + `/api/sessions` (`{sessions:[]}`) live; `npm run import` normalizes the folder into `core/memory/conversations/`. Device check of the share sheet pending.
- **Remaining**: surface the standard export prompt in-app (ES-010 §4); wire topic-tag retrieval into the chat session (ES-010 §7); owner device check of the share sheet.

---

### [P1-40] Habits bugfix — standup cadence, vitamin time, action recording, tracking list

- **Status**: In Review · **Category**: Bug · **Refs**: owner report 2026-10-16 · **Opened**: 2026-10-16
- **Report**: (1) no hourly standup; (2) water reminder 喝了 didn't add water; (3) missed 08:30 vitamin; (4) no place to track 起身/维生素.
- **Diagnosis**:
  - standup rule was interval **120 min + idle-gated** → not hourly.
  - `acted = 0` for **all** reminders over 3 days: the notification action never recorded the habit (no `water`/`standup`/`vitamin` action signal existed).
  - vitamin fired via the **Vercel cron** at Beijing 08:30 (= 00:30 UTC = 20:30 EDT); `fireDueReminders` hardcodes `Asia/Shanghai`, so local 08:30 never fired.
- **Fix**: standup → interval **60**, window 09:00–18:00, condition `always` (migration 011); `/api/reminder/act` records the **habit action** (water/standup +1, vitamin done) — collector sends the habit name; removed the **Vercel vitamin cron** (`vercel.json` `crons: []`); daily cap 6 → **14**; home **tracking list** adds tappable **起身 N/8** and **维生素 ✓/--** (schema `v4_signal_name`).
- **Doc**: `core/habits.md` (loaded into the prompt) + `docs/habits-tracking.md` so 元婴 can explain each habit.
- **Deploy**: collector **v1.0.23 (code 24)** + web.
- **Refinement (2026-10-16)**: notification buttons only record + dismiss (no app-open); **vitamin** → hourly (07:00–22:00) **until confirmed**, then stops that day (migration 012); all reminders bounded to **wake time** (outside quiet window); daily cap 30. Collector **v1.0.24 (code 25)**.
- **Bug (2026-10-16)**: buttons did nothing (notification stayed; vitamin unchecked). Cause: `ReminderActionReceiver.onReceive` ran the synchronous OkHttp POST on the **main thread** → `NetworkOnMainThreadException` (silently caught), and `setAutoCancel` does not dismiss on **action-button** taps. Fix: explicit `NotificationManagerCompat.cancel(notif_id)` + `goAsync()`/worker thread for the POST; fallback to `/api/signal` when the reminder row is missing. Collector **v1.0.25 (code 26)**.
- **Verified (2026-10-16)**: standup `interval 60 / 09:00–18:00 / always`; vitamin `interval 60 / 07:00–22:00 / count_below_target 1`; Vercel crons removed; homepage 200 with 起身/维生素 tracking; reminder-button fix released as collector **v1.0.25 (code 26)** — Play internal `completed`, CI build green.
- **Remaining**: owner device check (hourly standup, hourly vitamin-until-done, 喝了/起身了 updates + dismiss).

---

### [P1-51] Fenshen architecture — Core State + configurable interfaces (ES-013)

- **Status**: In Review · **Category**: Refactor + Feature · **Refs**: ES-013 · **Opened**: 2026-10-17
- **Label note**: Work Order referenced **P1-40** (already the habits bugfix). Renumbered on 2026-10-17 to match the owner's IDs: **P1-41** = notification-action bug, **P1-42** = feedback forwarding, **P1-43** = system self-awareness, **P1-44** = feedback button labels, **P1-45** = ES-016 feedback/manifest fix, **P1-46** = ES-017 GitHub integration, **P1-47** = ES-019 message actions, **P1-48** = ES-020 summary context/tone, **P1-49** = ES-021 agentic tools, **P1-50** = ES-018 feedback status, so Fenshen is **P1-51**.
- **Impl**: `fenshen` table (`id`, `display_name`, `prompt_md`, `avatar_url`) seeded with `xiaowu` / `kael` / `elara`; `config.active_fenshen` defaults to `"xiaowu"` (migration 013). `getActiveFenshen()` + async `buildSystemPrompt()` fetch the persona from Supabase at runtime (no hardcoded persona strings); core identity / ground rules / voice / habits stay shared. `/fenshen <name>` command intercepts in chat and updates `config.active_fenshen`; `/api/fenshen` GET/PUT; Settings dropdown switches it.
- **Shared memory**: all Fenshen read the same `messages` / `signals` / `summaries` — switching changes only the persona block.
- **Verified (2026-10-17, prod)**: table seeded (elara/kael/xiaowu), `active=xiaowu`; `/fenshen kael` → *"Switched to Kael."* and kael replied *"Kael active. What do you need?"*; `/fenshen elara` → elara replied warm (*"Hi. I'm here. 今天怎么样？"*); restored `xiaowu`. Same `messages` table shared across switches.
- **Remaining**: owner verifies adding a new `fenshen` row works with no deploy.

---

### [P1-41] Android notification action → signal write

- **Status**: In Review · **Category**: Bug · **Refs**: ES-007 §4 / P1-40 follow-up · **Opened**: 2026-10-17
- **Report**: tapping **起身了** on an Android reminder writes no `standup` signal (the reminder row exists, no signal). Same check for **喝了** (water).
- **Root cause (confirmed)**: `signals_source_check` allowed only `manual/usagestats/activitywatch/passive/inferred` — **not `reminder`**. Every reminder-originated signal insert was rejected (and swallowed). (`share`/`import` for session capture were rejected too.)
- **Secondary**: the action path leaned on the server to write the habit signal; `/api/signal` hardcoded `source='manual'`.
- **Fix**: `ReminderActionReceiver` now calls `POST /api/signal {name, source:'reminder'}` on **acted** (water/standup/vitamin) and `POST /api/reminder/act` for bookkeeping; `/api/signal` accepts `source` (`manual`/`reminder`/`passive`); `/api/reminder/act` no longer writes a habit signal (avoids double counting) — it only records `reminder_acted` + `acted_at`. Summary/home count from the habit signal alone.
- **Acceptance**: action button → new `signals` row with `source='reminder'`; summary count updates.
- **DB fix**: migration 014 extends `signals_source_check` to include `reminder`, `share`, `import`.
- **Verified (2026-10-17, prod)**: `POST /api/signal {name:'brief_wake', source:'reminder'}` → row `id=448, source='reminder'` (test row deleted).
- **Deploy**: collector **v1.0.26 (code 27)** + web — Play internal `completed` (code 27), CI build green.

---

### [P1-42] Feedback forwarding — GitHub issues + clipboard (ES-014)

- **Status**: In Review · **Category**: Feature (Integration) · **Refs**: ES-014 · **Opened**: 2026-10-17
- **Impl**: `POST /api/integrations/github` creates a repo issue (`GITHUB_TOKEN` + `GITHUB_REPO`, label `yuanying-feedback`); `lib/feedback-format.ts` builds the Dev body and the `[YUANYING FEEDBACK]` AI block. Feedback notes in the chat stream and the Feedback Inbox show **[Copy for Dev] [Copy for AI] [Save to Inbox]**.
  - Copy for Dev → creates a real GitHub issue (URL copied to clipboard).
  - Copy for AI → copies the markdown `<feedback>` block.
  - Save to Inbox → sets `promoted` (materialized by `npm run inbox`).
- **Env**: `GITHUB_REPO=gmyky57ndd-dev/yuanying`; `GITHUB_TOKEN` set in Vercel (server-only) + local `.env.local` (gitignored). Label `yuanying-feedback` created.
- **Verified (2026-10-17, prod)**: `/api/integrations/github` created real issue **#1** (`gmyky57ndd-dev/yuanying`, label `yuanying-feedback`), then closed after verification. Web deployed with `GITHUB_REPO`/`GITHUB_TOKEN`.
- **Remaining**: owner device check (tap Copy for Dev → new issue; Copy for AI → clipboard).

---

### [P1-43] System self-awareness + feedback UI (ES-015)

- **Status**: In Review · **Category**: Bug (UI) + Feature (AI Self-Awareness) · **Refs**: ES-015 · **Opened**: 2026-10-17
- **Impl**: new `core/system-manifest.md` maps the app's features (notes, tags, feedback, history, settings, collector) and is injected into `buildSystemPrompt()` (loaded in `loadCore`). Note UI now has an explicit **[标记为反馈]** toggle (tap a note → expand → mark/unmark). Feedback tab shows **[Copy for Dev]** and **[Copy for AI]** (plus Save to Inbox).
- **Result**: asking "how do I mark a note as feedback?" is answerable from the manifest.
- **Verified (2026-10-17, prod)**: asked `/api/chat` "how do I mark a note as feedback?" — replied with *点开那条 note，选「标记为反馈」→ 右上角「反馈」tab → Copy for Dev / Copy for AI* (read from the injected manifest).
- **Remaining**: owner device check of the toggle/buttons.

---

### [P1-45] Feedback loop fix + AI self-awareness (ES-016)

- **Status**: In Review · **Category**: Bug (Integration) + Feature (AI Manifest) · **Refs**: ES-016 · **Opened**: 2026-10-17
- **Impl**: `/api/integrations/github` confirmed working (issue #1 earlier); renamed the dev button **"Copy for Dev" → "Push to Dev"** in the note actions and Feedback tab; if GitHub is unconfigured/fails, it now **falls back to copying the issue text** to the clipboard. `core/system-manifest.md` rewritten to cover Home/History/Feedback/Settings and the note actions (标记为反馈, Save to Inbox, Push to Dev, Copy for AI) and loaded into `buildSystemPrompt()`.
- **Verified (2026-10-17, prod)**: asked the model to quote the Note Actions section — returned the new manifest verbatim (标记为反馈 / Save to Inbox / **Push to Dev** + clipboard fallback / Copy for AI). Earlier "I don't know" replies were conversation-history anchoring, not a stale deploy.
- **Remaining**: owner device check.

---

### [P1-46] Explicit GitHub integration + UI naming (ES-017)

- **Status**: In Review · **Category**: Bug (backend) + UI · **Refs**: ES-017 · **Opened**: 2026-10-17
- **Impl**: `app/api/integrations/github/route.ts` implemented per ES-017 §2 (`POST`, `GITHUB_TOKEN`/`GITHUB_REPO`, label `yuanying-feedback`, returns `issue_url`). UI label changed to **[Push to GitHub]** (note actions + Feedback tab); on success shows "Issue created!" with the issue URL (copied); on missing config/failure falls back to copying the issue text and alerts "GitHub token missing, copied to clipboard instead."
- **Env**: `GITHUB_TOKEN` / `GITHUB_REPO` documented in `.env.example`; already set in Vercel + `.env.local`.
- **Docs**: AGENTS.md **v1.7 §4.8** — specs for AI agents must state explicit file paths, fallbacks, and verifiable acceptance.
- **Verified (2026-10-17, prod)**: endpoint created real issue **#4** (`issue_url` returned, label `yuanying-feedback`), then closed after verification. Web deployed.
- **Remaining**: owner device check (Push to GitHub button).

---

### [P1-50] Feedback status & inbox commit (ES-018)

- **Status**: In Review · **Category**: Feature · **Refs**: ES-018 · **Opened**: 2026-10-17
- **Impl**: `feedback_status` column (`new|inbox|pushed|resolved`, migration 015). `POST /api/integrations/inbox` commits `docs/pm/inbox/YYYY-MM-DD-<id>.md` via the GitHub Contents API and sets `inbox` (stays `new` on failure). Push to GitHub sets `pushed` + stores `github_issue_url`. Feedback tab shows **[status]** chips, **[Save to Inbox]** (real commit), **[Mark Resolved]** (inbox/pushed only). `core/system-manifest.md` explains statuses; the chat prompt receives recent feedback statuses so 元婴 can answer "did you send it?".
- **Verified (2026-10-17, prod)**: Save to Inbox on note #490 → `POST /api/integrations/inbox` returned `docs/pm/inbox/2026-10-17-490.md`; repo commit `c551fd0` (332 B); DB `feedback_status='inbox'`, `promoted=true`.
- **Verified (2026-10-17)**: asked "did you send the feedback about Save to Inbox?" — 元婴 answered from the status (`[inbox]`, dev sees on next pull) and correctly said the new note was not sent.
- **Duplicate guardrail (2026-10-17)**: `/api/integrations/github` returns the existing issue (`already:true`) if the note already has `github_issue_url`; the UI shows **Pushed** and disables re-send. Save to Inbox remains hidden once status != `new`.
- **Guardrail verified (2026-10-17, prod)**: re-sending note #490 returns issue #7 with `already:true` and creates no new issue (title-based match also covers legacy notes). Note #490 context corrected to #7. Inbox no longer regresses `pushed/resolved` to `inbox`.
- **Remaining**: owner device check (chips / Save to Inbox / Mark Resolved).

---

### [P1-47] Direct message feedback — chat message actions (ES-019)

- **Status**: In Review · **Category**: Feature · **Refs**: ES-019 · **Opened**: 2026-10-17
- **Impl**: assistant message bubbles get a `⋮` menu (hover on desktop, long-press on mobile) with **Push to GitHub**, **Save to Inbox**, **Copy**. `POST /api/integrations/github` and `/api/integrations/inbox` accept `message_id`; pushed messages store `github_issue_url`/`github_issue_number` (migration 016) and show an **Issue #N** badge. Duplicate-safe (existing issue returned). Manifest gains a **Chat Actions** section.
- **Verified (2026-10-17, prod)**: test assistant message #81 → issue **#10** created and `messages.github_issue_url`/number set; Save to Inbox committed `docs/pm/inbox/2026-10-17-msg-81.md`. Test issue/file/message cleaned up.
- **Remaining**: owner device check (⋮ menu hover/long-press, badge).

---

### [P1-48] Daily summary context & tone (ES-020)

- **Status**: In Review · **Category**: Bug (prompt/logic) + Feature · **Refs**: ES-020 · **Opened**: 2026-10-18
- **Impl**: `SummaryData` gains `conversations`; `generateSummary` reads `core/memory/conversations/<date>-*.md` (Decisions section) and keeps the day's notes. The chat prompt renders **Owner's Notes** + **AI Conversations** first and numbers as secondary context. Base prompt adds a **Daily Summaries** rule (no unsolicited health advice; reflect inner state; "No notes yesterday." when empty).
- **Verified (2026-10-18, prod)**: `/api/summary/generate {date:2026-10-16}` returns `conversations: 1` (AI Capture & Feedback Loop, Decisions excerpt) + notes. Asking "summarize yesterday" led with the owner's notes/project context (feedback flow, Save to Inbox, steps, lost messages), numbers last, no health advice.
- **Remaining**: owner check.

---

### [P1-49] Agentic tools — function calling (ES-021)

- **Status**: In Review · **Category**: Feature (Architecture) · **Refs**: ES-021 · **Opened**: 2026-10-18
- **Impl**: DeepSeek calls now include `tools` (`get_notes`, `get_conversation_records`, `get_summary`) with a bounded tool loop (3 rounds, 20s/call); the backend executes Supabase/filesystem queries and feeds results back. Manifest gains a **Tools (法术)** section.
- **Verified (2026-10-18, prod)**: "昨天我写了什么笔记？" → `get_notes` returned the 9 Oct-17 notes; "Fenshen 是怎么决定的？" → `get_conversation_records` returned the ES-013 decisions (Core vs Interface, shared memory, no-deploy). (Earlier misses were deploy lag + model anchoring; a forced tool call listed ES-013.)
- **Extended by**: P1-53 / ES-022 (`push_to_dev`; shared GitHub helper).
- **Remaining**: owner check.

---

### [P1-52] Force proactive tool use (ES-021b)

- **Status**: Done (2026-10-18) · **Category**: Bug (Prompt/Behavior) · **Refs**: ES-021b, P1-49 · **Opened**: 2026-10-18
- **Label note**: Handoff labeled this **P1-50**, but P1-50 is ES-018 feedback status; following the owner-ID convention above, this item is **P1-52**.
- **Problem**: 元婴 has `get_conversation_records` / `get_notes` but answers shallowly or says it lacks context without querying the DB first.
- **Impl**: `core/system-manifest.md` gains **Rule: Proactive Tool Use** (must call a tool before answering questions about past notes/events/decisions; never claim missing context before querying; quote the returned section). Runtime prompt in `lib/yuanying.ts` reinforces: call `get_notes` / `get_conversation_records` / `get_summary` before answering, and only say "not in my context" after the tool returns nothing.
- **Verified (2026-10-18, prod, commit `ff99e64`)**: asked "昨天我写了什么笔记？" without prompting a tool → 元婴 returned the actual note list; asked "我们是怎么决定Fenshen架构的？" → it quoted the ES-013 Core/Interface split, no-deploy rule, and rationale.
- **Acceptance**:
  - [x] User asks about a past decision → 元婴 calls the tool without being prompted.
  - [x] 元婴 stops giving shallow answers when deep context exists in the DB.

---

### [P1-53] Phase 1 agentic tools (ES-022)

- **Status**: Done (2026-10-18) · **Category**: Feature (Architecture) · **Refs**: ES-022, ES-021, ES-021b · **Opened**: 2026-10-18
- **Label note**: Handoff labeled this **P1-51**, but P1-51 is ES-013 Fenshen architecture; following the owner-ID convention above, this item is **P1-53**.
- **Spec**: `docs/specs/ES-022-phase-1-tools.md`.
- **Impl**: `app/api/chat/route.ts` tool array now exposes `get_notes`, `get_conversation_records`, `get_summary` (retained from ES-021), and `push_to_dev(title, body)`. The bounded loop already handled `tool_calls` → backend execution → `role: 'tool'` → final answer. `push_to_dev` uses the new shared `lib/github.ts` helper (also used by `/api/integrations/github`); it reuses title-based dedupe and the `yuanying-feedback` label, returning `{ success, issue_url, number, already }` or `{ error }`.
- **Manifest**: `core/system-manifest.md` gains **你的工具 (Your Tools)**, tool-error wording, and **Rule: Confirm Before Sending**. Runtime prompt (`lib/yuanying.ts`) adds the same confirmation and failure-is-not-success rule.
- **Deviations from the handoff (recorded)**:
  - Notes are stored in `signals` where `name='note'` (not a `notes` table); `get_notes` already queries them with the product timezone.
  - `get_summary` is retained from ES-021 rather than removed, to avoid regressing an approved tool.
  - `push_to_dev` requires explicit owner confirmation before filing (AGENTS §2.2), so it is not fully autonomous on an inferred bug.
  - Forbidden tools (`send_email`, `send_message`, `write_code`, `execute_code`, `access_bank`, `make_payment`, `delete_data`, `drop_table`) were not added.
- **Verified (2026-10-18, local)**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass.
- **Verified (2026-10-18, prod, commit `ff99e64`)**:
  - `get_notes` → actual Oct-17 notes.
  - `get_conversation_records` → ES-013 quotes (Core/Interface, no-deploy, D7 rationale).
  - `push_to_dev` → created issue **#12** with the requested title/body; closed after verification as test cleanup.
  - Error path (local dev, invalid `GITHUB_TOKEN`) → 元婴 reported "失败了。原因：Bad credentials…没建成功" instead of claiming success.
- **Incident + fix (2026-10-18)**: production `GITHUB_TOKEN` went stale (`Bad credentials`). On a follow-up attempt, `push_to_dev` failed but 元婴 reported success and invented an issue URL (issue #13 did not exist). Root causes: invalid production token + model anchoring from the global last-20-message history. Fixes:
  - Replaced the production Vercel `GITHUB_TOKEN`/`GITHUB_REPO` with the verified local token/repo; redeployed (run **39140926403**). `push_to_dev` then created real issue **#13**, which was closed after verification.
  - Added a deterministic route guard in `app/api/chat/route.ts`: if the last `push_to_dev` result is an error/`success:false`, the reply is replaced with `没发成功。系统报错：<reason>`; `push_to_dev` now returns `success:false` on failure.
  - Hardened `core/system-manifest.md` + `lib/yuanying.ts`: only report success when the result has `success:true` and an `issue_url`; never invent a URL.
  - Deployed guard commit `3d7a643` (run **39141830075**, `yuanying-qj6vy2nqx-yuanying.vercel.app`). `tsc`/lint pass.
- **Known follow-up**: when chat history contains a near-identical prior request, the model may answer from history without calling `push_to_dev` even when explicitly asked. The route guard only applies after a tool call. History is currently the global last 20 messages, not session-scoped; revisit under P1-31/P1-52 if it recurs. Issue **#15** (fabricated issue URL) was closed on 2026-10-18 with this fix evidence.
- **Deploy note**: production deployment `dpl_B1FQXQMfAnvB9B9L8ALVQ75yF7wC` (commit `ff99e64`) was Ready and aliased to `https://yuanying-rust.vercel.app`. The GitHub Actions `Deploy Web (Vercel)` run initially failed because the `VERCEL_TOKEN` secret was invalid. Replaced it with a dedicated project-scoped Vercel CI token; workflow run **39140374327** passes. Later runs **39140926403** (prod GitHub token rotation) and **39141830075** (failure guard, commit `3d7a643`) are green and aliased to production.
- **Acceptance**:
  - [x] `get_notes` works when asked "昨天我写了什么笔记？", and the response includes actual note content.
  - [x] `get_conversation_records` quotes the ES-013 decision when asked "我们是怎么决定Fenshen架构的？".
  - [x] `push_to_dev` creates a GitHub issue when the owner explicitly asks and confirms.
  - [x] Tool errors are reported honestly, without fabricated success.

---

### [P1-54] Feedback lifecycle & copy/send separation (ES-023, issue #14)

- **Status**: Done (2026-10-18) · **Category**: Bug (UI/Architecture) + Documentation · **Refs**: Issue #14, ES-023, ES-024 (merged) · **Opened**: 2026-10-18
- **Spec**: `docs/specs/ES-023-feedback-lifecycle.md`. ES-024 overlapped and was merged into ES-023.
- **Problem**: Copy actions sat next to sending actions with no visual distinction; status was plain `[new]` text; no lifecycle diagram or inbox consumption doc. `Copy for Dev` was already removed in ES-016.
- **Impl**:
  - `components/FeedbackStatusBadge.tsx` — shared colored badges: New / Inbox / Pushed / Resolved.
  - `app/page.tsx` + `app/feedback/page.tsx` — renamed `Copy for AI` to **Copy as Text**, grouped it as a local action, and separated it from sending actions; status badges in both the notes list and Feedback tab.
  - `app/api/integrations/github/route.ts` — rejects Push for an already-`resolved` note (`409`); `resolved` is terminal.
  - `docs/feedback-lifecycle.md` — Mermaid state machine, action/effect table, failure behavior, inbox consumption.
  - `docs/pm/inbox/README.md` — Dev consumption process and `[已处理]`/archive convention.
  - `core/system-manifest.md` — accurate copy vs send and state-machine description.
- **Verified (2026-10-18, local)**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass.
- **Verified (2026-10-18, prod, commit `3a201c8`, deploy run `39143672850`)**: production chunks contain **Copy as Text**, **本地 / 发送** labels, and the status labels; no `Copy for AI` or `Copy for Dev` remains. Docs are in `docs/feedback-lifecycle.md`, `docs/pm/inbox/README.md`, and `docs/specs/ES-023-feedback-lifecycle.md`.
- **Acceptance**:
  - [x] No `Copy for Dev` in the UI.
  - [x] `Copy as Text` is visually local-only; sending actions are separate.
  - [x] Colored status badges in notes and Feedback tab.
  - [x] `docs/feedback-lifecycle.md` exists with Mermaid.
  - [x] `docs/pm/inbox/README.md` exists with consumption process.
  - [x] Manifest matches the implementation.
  - [x] `tsc` + lint + build pass; production contains the new labels/docs.
- **Notes**: `resolved` is now terminal server-side (`409` on Push). The guard is code-verified; there was no resolved note to exercise it in production. Issue #14 closed with the evidence.

---

### [P1-55] Steps source merge logic + debug view (ES-025)

- **Status**: Done (2026-10-18) · **Category**: Bug (Diagnostics) + Feature (Debug UI) · **Refs**: Issue #8, Issue #15 · **Opened**: 2026-10-18
- **Spec**: `docs/specs/ES-025-steps-source-debug.md`.
- **Issue note**: issue #15 is the separate `push_to_dev` fabricated-URL bug (fixed under P1-53); the steps questions belong on issue #8.
- **Impl**:
  - `app/api/steps/route.ts` — GET returns `sources`, `sources_count`, `source`, `aggregation`, `raw_value`, `window_start`, `window_end`, `timezone`, and `updated_at` from the row that produced the displayed max value.
  - `app/page.tsx` — tapping or long-pressing the steps line opens a debug modal listing each source (`package`, `steps`, record count), window, aggregation, and raw total.
- **Evidence (prod, 2026-10-18 16:45:36 UTC, signal #592)**: displayed **536**, raw **932**, two origins — Fit **396** (18 records) and HC phone **536** (35 records). No row in the last 200 had more than 2 origins. Watch **569** → 33-step gap, consistent with sync/sampling delay; double counting would look like the raw 932.
- **Answers**: `max_per_origin` groups by `dataOrigin.packageName`, sums each origin's records, then takes the max (not max per device/record). Sources are HealthConnect origins, not physical devices. The 33-step gap is within the <50-step sampling range; the watch source/timestamps are needed to prove the exact delay.
- **Verified (2026-10-18, local)**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass.
- **Verified (2026-10-18, prod, commit `0668f4a`, deploy run `39148233605`)**: `/api/steps` returns `sources` (Fit 396 / 18 records; HC phone 536 / 35 records), `raw_value: 932`, `aggregation: max_per_origin`, window/timezone. Production bundle contains the steps modal (`步数明细`).
- **GitHub**: four answers posted on issue #8 (comment `6252733575`). Issue #15 (push_to_dev fabricated URL) was closed separately with the P1-53 fix evidence.
- **Acceptance**:
  - [x] Four answers posted on issue #8.
  - [x] UI shows per-source breakdown.
  - [x] Production `/api/steps` returns `sources`.
  - [x] `tsc` + lint + build pass.
- **Notes**: 33-step watch gap is within the <50-step acceptance range; the debug view is the evidence path to distinguish sync lag from a logic bug. No collector change was needed.

---

### [P1-56] push_to_dev root cause + observability (issue #16)

- **Status**: Done (2026-10-18) · **Category**: Bug (Diagnostics/Observability) · **Refs**: Issue #16, P1-53 · **Opened**: 2026-10-18
- **Timeline (from issue #16)**: first `push_to_dev` returned a URL without `success`/`number`; the owner got 404. The second call returned `success:true`, `number:15`, `already:false` and created a real issue.
- **Root cause**: the production `GITHUB_TOKEN` was stale, so the GitHub API returned `401 Bad credentials`. The old tool returned `{error}` without `success:false`; the model then fabricated an issue URL. There is no code branch that constructs a URL — success URLs only come from the GitHub API or an existing-issue lookup. The first call created nothing, so the second call's `already:false` was correct.
- **Idempotency**: exact `title` match (trimmed, max 200 chars) against the most recent 100 issues (`state=all`). No separate key or body hash. `already:true` means that match hit; `already:false` means no match and this call created the issue.
- **Impl**:
  - `app/api/chat/route.ts` — `push_to_dev` always returns `{ success, issue_url, number, already, error }`; failures set `success:false`, `issue_url:null`, `number:null`, `already:false`, and a reason. Logs a body-free `tool_result push_to_dev` line.
  - `lib/github.ts` — validates `html_url`/`number` from the API response; logs list failures and create failures with HTTP status and response body (truncated); `already` is now required and always set.
- **Verified (2026-10-18, local)**: invalid token → `GitHubRequestError 401 Bad credentials` with `github issue create failed` log; dedupe call → issue **#12**, `already:true`; `tsc`, lint, and build pass.
- **Verified (2026-10-18, prod, commit `ffd719c`, deploy run `39148729304`)**: a dedupe `push_to_dev` call returned `success:true`, `number:12`, `already:true`; production log shows `github issue resolved { number: 12, already: true }` and `tool_result push_to_dev { success: true, number: 12, already: true, error: null }`. No new issue was created.
- **Acceptance**:
  - [x] Root cause documented.
  - [x] Unified result shape.
  - [x] No constructed-URL branch; failures return `success:false` + reason.
  - [x] Failure logs include status/body (truncated).
  - [x] Deploy + production `tool_result` log check; comment/close issue #16.

---

### [P1-58] Prevent false behavioral judgments from missing data (ES-028)

- **Status**: In Review (2026-10-19) · **Category**: Bug (Prompt/Logic) · **Refs**: ES-028 · **Opened**: 2026-10-19
- **PR**: https://github.com/gmyky57ndd-dev/yuanying/pull/19
- **Report**: phone steps dropped to 600 while charging; Xiaowu said "you barely moved today", ignoring 4120 watch steps.
- **Impl**: added `## Rule: Context before Judgment` to `core/fenshen/xiaowu/profile.md` and `core/system-manifest.md`. `lib/yuanying.ts` now loads an optional `core/fenshen/<id>/profile.md` for the active Fenshen, so the rule reaches the runtime prompt.
- **Acceptance**:
  - [x] Rule requires checking source/window before any behavioral judgment.
  - [x] Rule requires "I see [number] from [source]" instead of judging.
  - [ ] Owner verifies Xiaowu does not say "you barely moved" / "you need to walk more" with partial data.
- **Note**: `core/voice.md` still has the example `Steps: 0/5000 → 今天还没动。`, which conflicts with this rule. Left unchanged because ES-028 does not include `voice.md` in its scope; recommend a follow-up.

---

### [P1-60] Drive MIME fallback + web search backend errors (#31/#33)

- **Status**: In Review (2026-10-20) · **Category**: Bug (Tooling) · **Refs**: Issues #31, #33, ES-035, ES-036
- **#31 — `get_drive_doc` rejected `*/*`**:
  - RCA: file `1o5WgYgzSmtjq9sU-eQHIWR8Nt0gAjXvQ` is
    `stalio_export_csv_1792519528276.zip`; Drive returned `mimeType:"*/*"` and
    the strict MIME classifier rejected it. It is a ZIP, not a CSV.
  - Fix: infer MIME from `.csv/.json/.zip/.md/.txt` when MIME is empty,
    `*/*`, or `application/octet-stream`; log raw `{id,name,mimeType,size}`;
    store `effective_mime_type`; include raw MIME/name in unsupported errors.
  - Verified locally: the file now classifies as `zip`, lists `entries.csv` /
    `routines.csv`, and returns content.
- **#33 — web_search all backends failed**:
  - RCA: direct DuckDuckGo returns 403 from Vercel; Tavily had no key.
  - Fix: Jina Reader/DDG fallback (already deployed) + aggregated structured
    error listing every backend and status.
  - Verified locally: simulated all-403 → `All web search backends failed:
    tavily: not configured; duckduckgo: ...403; jina/duckduckgo: ...403`.
  - Production: `web_search` returns results and cited URLs.
- **Acceptance**:
  - [x] `*/*` CSV/ZIP file imports via extension fallback.
  - [x] Raw MIME/name logging is present.
  - [x] Web search has a working serverless fallback.
  - [x] All-failure error names each backend and status.
  - [ ] Deploy + owner retest of the two original files/questions.

### [P1-59] Open issue triage — push_to_dev, signal semantics, timezone, IME (#21–#25)

- **Status**: In Review (2026-10-20) · **Category**: Bug (Tooling/Data/Voice) · **Refs**: Issues #21, #22, #23, #24, #25
- **#21 / #24 — push_to_dev false success**:
  - `lib/github.ts` now reads the created issue back with `GET /repos/{repo}/issues/{number}` before returning success; a missing/mismatched issue throws.
  - `app/api/chat/route.ts` persists a deterministic success/failure message from the verified tool result, not a model-composed URL.
  - `core/system-manifest.md` says a read-back-verified success is authoritative even after past failures.
  - Verified locally: created test issue **#26** via `push_to_dev`, read-back matched, issue closed, test chat messages removed.
- **#22 — app_usage / standup semantics**:
  - `core/habits.md` + `docs/habits-tracking.md` now state: `app_usage` is foreground-only and not proof of being awake; `standup.source` distinguishes `manual` vs `reminder`; `reminder_acted` is bookkeeping, not a second count; standup is a check-in, not proof of physical movement.
- **#23 — vitamin time mismatch**:
  - RCA: signal `id=715` is `2026-10-20T11:51:02Z` = 07:51 America/New_York (UI) and 19:51 Asia/Shanghai (old prompt formatter). The reminder row was scheduled/shown/acted at 11:50:58–11:51:03Z; there was no hidden 07:51 record and no backfill code.
  - Fix: `lib/yuanying.ts` now formats signal/reminder times in `config.timezone` instead of hardcoded `Asia/Shanghai`.
- **#24 — input language / IME**:
  - Chat input now ignores Enter while composing (`composition` + `isComposing` + keyCode 229) and no longer forces `lang="zh-CN"`; same forced-language removal in note/import inputs.
- **#25 — comment tool**:
  - Manual comparison comment added to #24; no new autonomous comment tool was added.
- **Verification**: `tsc`, lint, build pass. Remaining: deploy and owner confirmation on the phone.

---

## To Do

_(ES-008/ES-009 home + history work is in review; no open To Do items.)_

### [P2-15] Data portability dry run (ES-034)

- **Status**: To Do (2026-10-19) · **Category**: Chore (Infrastructure Verification) · **Refs**: ES-034, ES-031 · **Opened**: 2026-10-19
- **Spec**: `docs/specs/ES-034-data-portability-dry-run.md`.
- **Label note**: the handoff requested **P2-10**, but P2-10 is the completed Phase C visual-polish item; renumbered to **P2-15**.
- **Depends on**: P2-14 (weekly SQL snapshot).
- **Acceptance**:
  - [ ] SQL dump imports into local Docker/Neon Postgres.
  - [ ] App reads/writes without Supabase when `DATABASE_URL` is set.
  - [ ] Migration completes in under 1 hour.

### [P2-16] Capability expansion — commitments, drafts, deep memory, external reader (ES-032)

- **Status**: To Do (2026-10-19) · **Category**: Feature (Tooling & Background Tasks) · **Refs**: ES-032 · **Opened**: 2026-10-19
- **Spec**: `docs/specs/ES-032-capability-expansion.md`.
- **Priority**: Medium; schedule after Phase C UI.
- **Boundary**: confirm before sending; no autonomous external actions.
- **Depends on**: P1-09 (collector notifications), ES-030 (external reader), an embedding model for pgvector.

### [P2-17] Legacy data ingestion — Stalio & Blinking Notes (ES-033)

- **Status**: To Do (2026-10-19) · **Category**: Feature (Data Migration) · **Refs**: ES-033, ES-030, ES-002 · **Opened**: 2026-10-19
- **Spec**: `docs/specs/ES-033-legacy-data-ingestion.md`.
- **Boundary**: no new UI; use `scripts/` with `npm run import:legacy`, idempotent batches, provenance in `context`.
- **Depends on**: owner-provided export formats/samples.

### [B-19] Date/reminder windows use fixed Asia/Shanghai, not the phone timezone `[BUG]`

- **Status**: In Review · **Phase**: P0 · **Opened**: 2026-10-15 · **Refs** AGENTS §2.1/§6; commit `bc4aa12`
- **Description**: Date boundaries and reminder windows are computed in a hardcoded `Asia/Shanghai` (collector `ReminderScheduler` TZ constant, `lib/timezone.ts` default, `config.timezone` default). On a phone whose location/timezone is not Beijing, the reminder windows map to the wrong local time and notifications fire during the user's sleeping hours.
- **Observed**: a reminder notification fired during sleeping time.
- **Fix (implemented)**: collector uses the **device timezone** (`TimeZone.getDefault()`) and is the **primary writer** of `config.timezone` (each hourly run); the PWA writes only on a **>1h mismatch** (exception). Added **quiet window 22:00–07:00** (`config.quiet_window`) — reminders suppressed, no backfill (ES-001 §3 / owner D5).
- **Acceptance**:
  - [x] Reminders evaluated in the device timezone
  - [x] No notifications during the quiet window (no backfill)
  - [x] `config.timezone` reflects the device timezone (collector primary)
  - [ ] Owner device verification (collector v1.0.11)
- **Notes**: Not a duplicate of B-16 (B-16 scoped daily counts to a *configured* tz; this makes that tz the device's). Collector **v1.0.11** (code 12) pending Play upload + device check.

### [P1-15] Review & optimize self-upgrade

- **Status**: In Progress
- **Owner**: @agent
- **Opened**: 2026-10-14
- **Phase**: P1
- **Refs**: AGENTS §4.4/§4.7; `docs/runbooks/self-upgrade.md`
- **Description**: Dedicated session to review and optimize the two self-upgrade planes end-to-end and make them robust:
  - **PWA**: GitHub Actions → `vercel deploy --prod` (currently works; token is a reused CLI OAuth token — move to a dedicated no-expiration token; add failure alerting).
  - **Collector**: Play auto-update vs. in-app `AppUpdateManager`; ensure the release pipeline (`v*` tag → signed AAB → Play track) is automated.
- **Acceptance**:
  - [x] Deploy loop verified from a clean state; failures surface
  - [x] Dedicated `VERCEL_TOKEN` (no expiration) with rotation note — **done 2026-10-18**: project-scoped token stored as the GitHub Actions secret; deploy run `39140374327` green. Rotate/revoke at https://vercel.com/account/tokens if exposed.
  - [x] Play upload automated (service account) OR documented manual fallback — **verified**: v1.0.14 release uploaded to Play internal (draft); workflow gated on `PLAY_SERVICE_ACCOUNT_JSON`
  - [x] A short runbook in `docs/` — `docs/runbooks/self-upgrade.md`
- **Notes**: **Dedicated session** — do not fold into other work. **Scheduled 2026-10-15** (owner: run the manual process one more day). **Interim (owner, 2026-10-14):** use web auto-deployment (`deploy.yml`) for the PWA and **manual AAB upload to Google Play** for the collector until this session. **Observation 2026-10-15:** the Vercel Git integration is auto-deploying on push again (independent of CI); the CI `VERCEL_TOKEN` (reused CLI OAuth) rotated and was refreshed — a dedicated no-expiration token is still required. **Token update (2026-10-18):** replaced it with a dedicated project-scoped token; CI deploy is green.
- **Bug fix (2026-10-16)** — *Play internal never updated past 1.0.9*:
  - **Report**: owner saw the Play Store internal list still on **1.0.9**.
  - **Diagnosis** (Play Developer API, `internal` track): `status=draft versionCodes=18` (the latest draft) alongside `status=completed versionCodes=10` (1.0.9). Every upload since 1.0.9 was a **draft**, which is never rolled out → testers stayed on 1.0.9.
  - **Root cause**: `android-release.yml` uploaded with `status: draft`.
  - **Fix**: upload with `status: completed`; made the GitHub Release step idempotent; fixed tag resolution for `workflow_dispatch`. Collector **v1.0.18 (code 19)**.
  - **Verified (2026-10-16)**: release run `38941378463` green; Play `internal` now `status=completed name=1.0.18 versionCodes=19`.
  - **Remaining**: owner confirms the phone updates 1.0.9 → 1.0.18 via Play internal.
- **Feature (2026-10-16)** — *in-app update link*: collector home adds an **更新到最新版** button that opens the Play internal-testing page (`https://play.google.com/apps/internaltest/4701496216557819136`), so the owner can pull the latest build when the store shows no update. Collector **v1.0.19 (code 20)**. **In Review** (device verify pending).

---

## Blocked

### [P1-22] Wake detection — brief_wake vs wake

- **Status**: Blocked · **Category**: Bug · **Refs**: ES-007 §2 · **Opened**: 2026-10-16
- **Done**: `brief_wake` added to the signal-name constraint (`v3_signal_name`, migration `010_brief_wake.sql`) and to `/api/signal` accepted names; summaries count only `wake` (brief_wake excluded).
- **Blocker**: §2 requires inferring brief-wake vs wake from an unlock/brief-wake signal and prompting once per night. The app has **no unlock/brief-wake detection source** (no unlock-access permission; HealthConnect does not expose it). Needs an owner decision on the detection source.
- **Unblocker**: approve a detection source (or drop the auto-prompt and keep brief_wake as a manual/collector-only signal).

### [P0-05] API authentication (ES-004)

- **Status**: In Progress · **Phase**: P0 · **Opened**: 2026-10-15
- **Refs**: `docs/specs/ES-004-api-authentication.md` (approved 2026-10-15)
- **Description**: Global API access control. PWA = owner password → **httpOnly session cookie (30 days, refreshed on use)**; collector = bearer token; `/api/cron/*` keeps `CRON_SECRET`.
- **Sub-tasks**:
  - [x] **Logging phase** (§3.1) — live 2026-10-15; `auth_events` populated (`would_401` recorded, `enforced=false`).
  - [ ] **Enforce phase** — set `AUTH_ENFORCE=true` after the grace (target ~2026-10-22), once legitimate clients show `would_401=false`.
  - [x] PWA session cookie (30d, refreshed on use) + collector bearer (baked build-time).
- **Notes**: Priority #2. Grace started **2026-10-15** → enforce on/after **2026-10-22**. `OWNER_PASSWORD`/`API_TOKEN`/`SESSION_SECRET`/`IP_SALT` set in Vercel + `.env.local` (values not recorded here). ES-001 v1.1 write endpoints depend on this.

### [P1-13] Daily notes

- **Status**: In Review · **Phase**: P1 · **Opened**: 2026-10-14 · **Refs** `docs/specs/ES-002-daily-notes.md` (approved 2026-10-15); commit `4527ecc`
- **Description**: "记一笔" text note (voice transcribed at input; text only); notes stored as signals and integrated into the summary.
- **Acceptance**:
  - [x] `note` accepted (migration) + server validation (empty / >2000 rejected)
  - [x] Content never logged
  - [x] PWA 记一笔 editor + count + today's list; mic hidden if unsupported (A1)
  - [x] Summary `notes {count, ≤10 excerpts ≤200}`; prompt labeling block (A2)
  - [ ] Owner device verification
- **Notes**: Verified in production (valid / empty / long; summary includes the note). Deletion UI deferred to **P2-01**.

### [P1-14] Tracking visibility

- **Status**: In Review · **Phase**: P1 · **Opened**: 2026-10-14 · **Refs** `docs/specs/ES-003-tracking-visibility.md` (approved 2026-10-15); commit `4036521`
- **Description**: Home “今天” transparency panel (collapsible): 自动 / 手动 / 提醒, counts only.
- **Acceptance**:
  - [x] Collapsed one-line summary `今天 ▸ 自动 n · 手动 n · 提醒 n` (B1)
  - [x] Rows count only (no app names) (B2)
  - [x] Tap a row → prefilled editable chat; send stays explicit (no auto model call)
  - [x] Reads `/api/summary/today`; refreshes after log/note/chat
  - [ ] Owner device verification
- **Notes**: Added `apps_used` to the summary; cached-summary now regenerates on schema drift. Depends on B-17 (fixed).

---

## Done

### [P0-00] Fix PWA not loading after install
- **Status**: Done · **Closed**: 2026-03-17 · **Notes**: Reinforced by SW v2 (network-first).

### [P0-00b] Android collector permission working
- **Status**: Done · **Closed**: 2026-03-17.

### [F3] Collector data flow verified (audit)
- **Status**: Done · **Closed**: 2026-10-14 · **Notes**: 11 hourly batches, 161+ `app_usage` rows confirmed.

---

## Backlog

Unscheduled. Do not start without owner/tech-lead scheduling.

- **[B-01]** Passive wake/sleep from lock screen · **[B-02]** iOS HealthKit steps · **[B-03]** Desktop companion · **[B-04]** Animated avatar · **[B-05]** Morning/evening briefings · **[B-06]** Pattern engine · **[B-07]** Persona customization UI · **[B-08]** Model router · **[B-09]** Whisper voice input · **[B-10]** Weekly digest · **[B-11]** Stelio full migration · **[B-12]** Share sheet · **[B-13]** Wake word · **[B-14]** `activity_logs` retention · **[B-20]** `summaries` retention/pruning · **[B-22]** Note deletion UI (ES-002; deferred, not v1)

### [P1-44] Clarify feedback button labels (UI Phase C)

- **Status**: Backlog · **Category**: UI/UX · **Refs**: ES-014 / ES-015 · **Opened**: 2026-10-17
- Change **"Copy for Dev" → "Copy as GitHub Issue"** and **"Copy for AI" → "Copy for Assistant"** — both use the clipboard.
- **Superseded** by ES-016: the dev button is renamed **"Push to Dev"** (creates a GitHub issue).

---

## Won't Do

### [P1-02] Reminder cron endpoints
- **Reason**: Replaced by P1-09 (collector owns generation + delivery). External cron and Vercel Pro explicitly rejected (`docs/Dev Response 1014.md` §2.1, §5).
- **Closed**: 2026-10-14

### [W-01] Habit tracking UI replicating Stelio
### [W-02] `sit` as a tracked signal
### [W-03] Multi-user / accounts / authentication
### [W-04] Analytics / growth metrics / engagement loops

---

## Changelog

### 2026-10-18 (session 36 — ES-026 Phase C UI/UX)
- Home: Fenshen avatar/name (tap → Settings) + five-habit grid; today-only stream/chat preserved. History: day list includes standup; detail adds full notes/tags and AI conversation excerpts. Chat: spinner statuses, Save-to-Inbox badge via `messages.metadata.inbox_path`. Visual: fade-in + breathing avatar with reduced-motion fallback. Added `docs/specs/ES-026-phase-c-ui-restructure.md`; tracking P2-06..P2-10 (P2-01..P2-05 already used by Opinions). PR **#17** merged; deploy run **39153665136** green. → **P2-06..P2-10 Done**.

### 2026-10-18 (session 35 — issue #16 push_to_dev root cause)
- Root cause: stale prod `GITHUB_TOKEN` → `401 Bad credentials`; old tool returned `{error}` without `success:false` and the model fabricated the URL. Unified `push_to_dev` result (`success`, `issue_url`, `number`, `already`, `error`), validated API `html_url`/`number`, and added body-free tool-result + GitHub failure logs. Production dedupe check returned `number:12`, `already:true`, no duplicate. Verified in prod (run `39148729304`); issue #16 closed. → **P1-56 Done**.

### 2026-10-18 (session 34 — ES-025 steps source debug, issue #8/#15)
- `/api/steps` now returns the source breakdown and metadata for the row that produced the displayed max. Home steps line opens a debug modal on tap/long-press. Documented `max_per_origin` and the 33-step sync-delay evidence in `docs/specs/ES-025-steps-source-debug.md`; answers posted on issue #8. Verified in prod (run `39148233605`). → **P1-55 Done**.
- Closed issue #15 (push_to_dev fabricated URL) with the P1-53 fix evidence.

### 2026-10-18 (session 33 — ES-023 feedback lifecycle, issue #14)
- Renamed **Copy for AI** → **Copy as Text** and grouped it as local-only; sending actions stay separate. Added shared colored status badges. Blocked Push for `resolved` notes (`409`). Added `docs/feedback-lifecycle.md`, `docs/pm/inbox/README.md`, and `docs/specs/ES-023-feedback-lifecycle.md` (ES-024 merged). Verified in production (run `39143672850`); issue #14 closed. → **P1-54 Done**.

### 2026-10-18 (session 32 — push_to_dev token failure + fabricated success)
- Production `GITHUB_TOKEN` was stale (`Bad credentials`); `push_to_dev` failed and the model falsely reported success with a nonexistent issue URL. Rotated the Vercel production token/repo and redeployed; real issue **#13** created and closed. Added a deterministic failure guard in `app/api/chat/route.ts`, `success:false` tool returns, and stricter manifest/runtime wording. Guard commit `3d7a643` deployed via run **39141830075**. Known follow-up: model anchoring from global history can skip the tool call. → **P1-53** evidence updated.

### 2026-10-18 (session 31 — ES-022 Phase 1 tools)
- Added `push_to_dev(title, body)` to the DeepSeek tool array; extracted shared `lib/github.ts` (title dedupe, `yuanying-feedback` label) used by both the tool and `/api/integrations/github`. Manifest/runtime require owner confirmation before filing and honest tool-error wording. Forbidden tools not added. New item **P1-53** (handoff labeled P1-51, already ES-013). → **P1-53**.
- **Verified in prod (commit `ff99e64`)**: 元婴 auto-called `get_notes` and `get_conversation_records`; `push_to_dev` created issue **#12** with the requested title/body (closed after test); invalid GitHub credentials produced an honest failure message. → **P1-52 Done**, **P1-53 Done**.
- **Deploy**: replaced the invalid `VERCEL_TOKEN` repo secret with a dedicated project-scoped Vercel CI token; workflow run **39140374327** passed and aliased `yuanying-oh9enmnsi-yuanying.vercel.app` to production.

### 2026-10-18 (session 30 — ES-021b proactive tool use)
- Manifest gains **Rule: Proactive Tool Use**; runtime prompt requires querying `get_notes` / `get_conversation_records` / `get_summary` before answering past-context questions. New item **P1-52** (handoff labeled P1-50, already ES-018).

### 2026-10-18 (session 29 — ES-021 agentic tools)
- Added DeepSeek function calling (`get_notes`, `get_conversation_records`, `get_summary`) with a bounded tool loop; manifest documents the tools. Renumbered ES-018 to **P1-50**, Fenshen to **P1-51**. → **P1-49**.

### 2026-10-18 (session 28 — ES-020 summary context & tone)
- Summary data includes the day's notes + distilled AI conversations; prompt prioritizes them and adds a no-health-coach tone rule ("No notes yesterday."). Renumbered ES-018 to **P1-49**, Fenshen to **P1-50**. → **P1-48**.

### 2026-10-18 (session 27 — issue #11 chat history truncation)
- Root cause: ascending + limit 50 returned the oldest messages once a day exceeded 50. Fixed to newest-first (+ reverse) with a day upper bound; UI no longer wipes on error. → **B-24**. Closed issue #11.

### 2026-10-17 (session 26 — ES-019 message actions)
- Chat assistant messages get **Push to GitHub / Save to Inbox / Copy** via a `⋮` menu (hover/long-press); message-level `github_issue_url` + **Issue #N** badge. Renumbered ES-018 to **P1-48**, Fenshen to **P1-49**. → **P1-47**.

### 2026-10-17 (session 25 — duplicate guardrail + steps cutoff)
- Issue duplicate guardrail: server returns the existing issue if a note already has `github_issue_url`; UI shows **Pushed**/disabled; hides Save to Inbox unless status is `new`.
- Steps display cutoff now prefers `aggregation='max_per_origin'` rows, so the invalid `sum` row (8371) no longer overrides the corrected row (4595).

### 2026-10-17 (session 24 — issue triage + steps max-per-origin)
- Issue #8: HealthConnect origins were summed (Fit 4054 + phone 4317 = 8371). Steps now use **max per origin** (`max_per_origin`), raw sum kept for audit. Collector **v1.0.27 (code 28)**.
- Closed GitHub issues #2/#3/#5/#6/#7/#8 with explanations after the fixes.

### 2026-10-17 (session 23 — ES-018 feedback status & inbox commit)
- Added `feedback_status` (new/inbox/pushed/resolved); `POST /api/integrations/inbox` commits the inbox file via GitHub Contents API; Push to GitHub sets `pushed` + issue URL; status chips + Mark Resolved; manifest + prompt status awareness. Renumbered Fenshen to **P1-48**. → **P1-47**.

### 2026-10-17 (session 22 — ES-017 GitHub integration + spec lesson)
- Implemented `/api/integrations/github` per spec (`issue_url`); label → **Push to GitHub**; success shows issue URL, failure falls back to clipboard. `.env.example` documents `GITHUB_TOKEN`/`GITHUB_REPO`.
- AGENTS.md **v1.7 §4.8**: explicit file paths + fallbacks + verifiable acceptance for AI-agent specs. Renumbered Fenshen to **P1-47**. → **P1-46**.

### 2026-10-17 (session 21 — ES-016 feedback loop + manifest)
- Renamed dev action to **Push to Dev**; added clipboard fallback when GitHub is unconfigured. Rewrote `core/system-manifest.md` (nav + note actions incl. Save to Inbox) — loaded into the prompt. Renumbered Fenshen to **P1-46**. → **P1-45**.

### 2026-10-17 (session 20 — duplicate notes + P1-44 backlog)
- Fixed duplicate notes (**B-23**): client save guard + 5s server dedupe.
- Added **P1-44** (clarify feedback labels) to Backlog per owner (UI Phase C). Renumbered Fenshen to **P1-45**.

### 2026-10-17 (session 19 — P1-43 system self-awareness)
- Added `core/system-manifest.md` (injected into the prompt); explicit [标记为反馈] toggle in the note UI; Feedback tab copy buttons already present. Renumbered Fenshen to **P1-44**. → **P1-43**.

### 2026-10-17 (session 18 — P1-42 feedback forwarding)
- `POST /api/integrations/github` + `lib/feedback-format.ts`; chat/inbox buttons [Copy for Dev] [Copy for AI] [Save to Inbox]. Real GitHub issues via `GITHUB_TOKEN`/`GITHUB_REPO`; label `yuanying-feedback`. Renumbered Fenshen ES-013 to **P1-43**. → **P1-42**.

### 2026-10-17 (session 17 — P1-41 notification action → signal)
- `ReminderActionReceiver` writes the habit signal directly via `POST /api/signal {name, source:'reminder'}` on acted, plus `/api/reminder/act` bookkeeping; `/api/signal` accepts `source`; `/api/reminder/act` no longer writes a habit signal (no double count). Collector **v1.0.26 (code 27)**.
- Renumbered ES-013 Fenshen to **P1-42** (owner assigned P1-41 to this bug).

### 2026-10-17 (session 16 — ES-013 Fenshen architecture)
- Split **Core State (元婴)** from **Interfaces (Fenshen)**. `fenshen` table seeded `xiaowu`/`kael`/`elara`; `config.active_fenshen` = `xiaowu` (migration 013).
- `buildSystemPrompt()` is now async and pulls the active persona from Supabase — no hardcoded prompt strings, no deploy to add a Fenshen.
- `/fenshen <name>` command + `/api/fenshen` (GET/PUT) + Settings dropdown. Shared memory across personas. → **P1-44**.

### 2026-10-16 (session 15 — habits bugfix)
- Owner report: no hourly standup · 喝了 didn't add water · missed 08:30 vitamin · no 起身/维生素 tracking.
- Root causes: standup 120min+idle; notification action never recorded a habit signal (acted=0); vitamin fired by a Beijing-anchored Vercel cron.
- Fixes: standup hourly (60, 09–18, always) via migration 011; `/api/reminder/act` records the habit action; removed the vitamin cron; cap 6→14; home tracking list adds 起身/维生素; new `core/habits.md` + `docs/habits-tracking.md`. Collector **v1.0.23 (code 24)**. → **P1-40**.

### 2026-10-16 (session 14 — ES-010/011/012 from PM feedback)
- Created specs: **ES-010** (AI session capture), **ES-011** (self-diagnostic response), **ES-012** (notes: language, tags, feedback loop) — in repo `docs/specs/` + PM `docs/specs/`.
- **P0**:
  - **P1-37** note language (**In Review**): reproduction logged (all notes Latin-only; owner note "switch language does not work"); defensive IME fix (`lang=zh-CN` + input attrs + composition sync).
  - **P1-36** self-diagnostic (**In Review**): `core/voice.md` "When something is wrong"; provenance logging; AGENTS §5.1 bullet 7 + **v1.6**.
  - **P1-23** steps provenance (`source`/`aggregation`/`raw_value`) + local-midnight fix; collector **v1.0.22 (code 23)**.
- **This week**: **P1-38** tags (**In Review**), **P1-39** feedback loop (**In Review**), **P1-35** session capture (**In Progress**).
- New: `lib/tags.ts`, `api/note/[id]`, `api/feedback`, `api/sessions`, pages `/import` + `/feedback`, scripts `import.mjs` + `inbox.mjs`.

### 2026-10-16 (session 13 — P1-23 steps window fix)
- **P1-23 corrected**: `StepsCollector.startOfDay` used `Instant.now().truncatedTo(DAYS)` (**UTC**), so the window `[UTC 00:00, now)` started ~4h before the local day on `America/New_York` (inflating today: `2700`). Fixed to **local midnight** in the device timezone. Aggregation **unchanged** (owner: not a summation bug). Collector **v1.0.21 (code 22)**.
- **Display cutoff**: `pickDailySteps` + `GET /api/steps` prefer rows tagged `context.timezone` (v1.0.21+) so the corrected reading replaces the inflated max; legacy rows kept for audit.
- First release run hit a transient Maven **429**; re-ran → green. Play internal `completed` (code 22). Prod corrects once the phone runs v1.0.21.

### 2026-10-16 (session 12 — P1-23 reopened (P0), steps diagnostic)
- **P1-23 reopened as P0.** Corrected hypothesis (owner): **not** summation across sources — Fit and Watch are independent and ≈ truth; **HealthConnect-via-元婴 is the outlier**.
- **Diagnostic logged** (window / sources / per-source count / aggregation mode): window = `[UTC 00:00, now)` (UTC, not local midnight → includes ~4h of prior local evening); aggregation = `sum_all_origins` (no `DataOriginFilter`); per-source counts previously **not captured** (DB all `source='passive'`).
- **Instrumentation only (no fix)**: collector sends `sources`/`sources_count`/`aggregation`; `POST /api/steps` persists them. Collector **v1.0.20 (code 21)**. **No aggregation fix applied** pending captured per-origin data.

### 2026-10-16 (session 11 — ES-009 UAT triage: home scope + history detail)
- **ES-009** treats ES-008 §2.1/§2.2 as revised. Executed **P1-30 → P1-34** (all **In Review**):
  - **P1-30** home = today only: removed 昨天 panel + `自动·手动·提醒` line; added raw **今天** activity stream (`lib/activity-stream.ts`) + empty state.
  - **P1-31** chat scoped to today: `/api/history?today=1`.
  - **P1-32** notes expand inline (home stream + history).
  - **P1-33** History groups `app_usage` into expandable **应用会话**; hides zero/unchanged steps rows.
  - **P1-34** summary 概要 shows habit counts (起床/入睡/喝水/起身/维生素); 提醒 moved to a collapsed audit subsection.
- **P1-26 / P1-29** → **In Review** (home today-only; settings off home / corner nav only).
- **B-21** re-diagnosed: today's all-zero steps is a **collection** gap, not aggregation (max fix holds); escalated.

### 2026-10-16 (session 10 — ES-008 C-phase UI: History + Notes)
- **ES-007 closed.** **ES-008 started.** Order: §2.2 History → §2.3 notes → §2.1 Home.
- **P1-27** History tab (**In Review**): `/history` page + `api/history/{days,day,search}`; day list → detail (signals, notes, reminders, chat, prose summary); search by date + note keyword; cloud-first.
- **P1-28** Notes (**In Review**): free-text + optional mic confirmed; no dropdowns/tags/required fields; notes surfaced/searchable in History.
- **P1-26** Home redesign & **P1-29** settings-off-home: **To Do**, gated on owner confirming the ES-007 §1 18:00 flip.
- AGENTS §5.2.9 / §8 (no new capture surfaces) honored — notes ride on the existing 记一笔 button; History is a tab, not a new product.

### 2026-10-16 (session 9 — Work Order: ES-007 P1-21…P1-25)
- **P1-21** summary window (**In Review**): `getDisplayDay()` + `getDisplaySummary()`; summary/chat/panel reflect the last completed day (18:00 rule).
- **P1-22** wake detection (**Blocked**): `brief_wake` added to schema constraint `v3_signal_name` (migration `010_brief_wake.sql`) + `/api/signal`; auto brief-wake inference blocked (no unlock detection source).
- **P1-23** steps (**In Review**): diagnostic logged (723→0 overwrite); `pickDailySteps` + `GET /api/steps` now take the day's max snapshot.
- **P1-24** action model (**In Review**): `standup`/`vitamin` in summary; 喝水/起身/维生素 counters; reminder action = manual action.
- **P1-25** reminder buttons (**In Review**): collector habit action + 忽略; `ReminderActionReceiver` acted/dismissed; device verify pending.
- AGENTS.md → **v1.5**; docs created: `ES-007`, `ES-008`, `2026-10-16-feedback`.
- **Released collector v1.0.17 (code 18)** on owner "push": signed AAB/APK + Play internal upload.
- **Fixed Play internal never updating past 1.0.9**: uploads were `status: draft` (never rolled out) → switched to `status: completed`; released **v1.0.18 (code 19)**; Play `internal` now `completed`. See **P1-15**.

### 2026-10-15 (session 8 — owner identity revision)
- Owner revised `core/identity.md` (user→owner; signals/notes reframing). Loaded into the prompt; web deploy via push.

### 2026-10-15 (session 7 — collector version record)
- Collector UI now shows a **version + updated-timestamp record** (`v1.0.16 (17) · 更新 <last update>`). Collector **v1.0.16** (code 17).
- Release trigger confirmed **manual**: owner says "push" → web push-deploy + collector tag→Play.

### 2026-10-15 (session 6 — ES-006 learning loop)
- Executed P2-01..P2-05: opinions files, detector 1, confirmation transitions, prompt integration, off-limits filter (all **In Review**).
- Detector + transitions run as an **agent-batch script** (`scripts/opinions.mjs`); `core/opinions/*.md` are read-only on the runtime (writes committed).
- Backlog note-deletion renumbered **P2-01 → B-22** (ID freed for ES-006 §13).

### 2026-10-15 (session 5 — ES-005 option A)
- Executed ES-005 Part C: steps diagnostic (aggregation bug fixed), `summaries.type` migration, reminder cadence (quiet window / 2h standup / cap 6 / miss-60min), weekly digest, voice pass, ground-rules prompt integration.
- New: **P1-16** (voice), **P1-17** (cadence), **P1-18** (digest), **P1-19** (ground rules) → In Review. **B-21** (steps) confirmed+fixed.
- Collector **v1.0.15**.
- **Self-upgrade complete**: web auto-deploy + collector tag → signed AAB → GitHub Release → Play internal (verified).

### 2026-10-15 (session 4 — ES-001 landed; B-19; ES approvals)
- ES-001 v1 landed → P1-12 In Review (migration+seed, `GET /api/habits`, config-driven collector reminders, read-only settings). Collector v1.0.10.
- ES-002/ES-003/ES-004 **approved** with owner amendments; specs updated (ES-002 A1/A2; ES-003 B1/B2; ES-004 C1/C3; ES-001 §3 D5).
- **P0-05 (ES-004) → In Progress** — logging phase first (7-day grace; `auth_events` table), then enforce.
- **B-19 implemented** (device timezone + quiet window) → In Review; collector **v1.0.11** (code 12).
- Backlog: **[P2-01]** Note deletion UI (ES-002, deferred).
- **Priority order:** B-19 → ES-004 logging → ES-002 → ES-003 → ES-004 enforce.
- **ES-004 logging phase implemented** (behind `AUTH_ENFORCE=false`): middleware + `auth_events` + PWA session cookie + collector bearer. Grace started 2026-10-15. Collector **v1.0.12** (code 13).
- **ES-002 implemented** (daily notes): `note` migration, `/api/note`, summary notes + prompt labeling, PWA 记一笔 editor → P1-13 In Review.
- **ES-003 implemented** (tracking visibility): collapsible 今天 panel (counts only) → P1-14 In Review. Added `apps_used` to summary.
- **Self-upgrade (P1-15)**: runbook `docs/runbooks/self-upgrade.md`; Play auto-upload added to `android-release.yml` (gated on `PLAY_SERVICE_ACCOUNT_JSON`); dedicated `VERCEL_TOKEN` pending owner.
- **ES-004 enforce runbook** `docs/runbooks/ES-004-enforce.md`; reminder set for **2026-10-22** (Scheduled reminders).
- **Play auto-upload wired**: `PLAY_SERVICE_ACCOUNT_JSON` secret set; v1.0.13 release published. **Blocked** on owner Cloud step — enable the *Google Play Android Developer API* in project `yuanying-511715` (761958009862) + grant the service account Release permission in Play Console. Then re-run the release.
- **Play auto-upload verified** (owner enabled the API + granted the service account): release v1.0.14 → AAB uploaded to Play **internal** track (draft). Full self-upgrade loop now automated: web (Git integration) + collector (tag → signed AAB → GitHub Release → Play).
- **Docs committed** (external edits by owner/Gemini, recorded here): `AGENTS.md` **v1.4 (draft)** (left as-is per instruction), `AGENTS-v1.3.md` archive, and `docs/specs/ES-001/002/003`. Note: `ES-004`, the runbooks, and the PM feedback still live at the project root `docs/` (outside this repo).

### 2026-10-14 (session 3 — PM handoff)
- Adopted PM Feedback 2026-10-14. Created + fixed **B-17** (button/summary inconsistency) and **B-18** (元婴 states inference as fact) → In Review.
- Created **P1-12** (Configurable habits), **P1-13** (Daily notes), **P1-14** (Tracking visibility) — **Blocked**: the `ES-001/002/003` spec files are **not present** in the repo.
- Renumbered the self-upgrade item **P1-12 → P1-15** to free P1-12 for Configurable habits (PM doc §6).
- Reported the missing spec files and requested them (AGENTS §9).
- **B-19** logged (Bug P0): date/reminder windows hardcode `Asia/Shanghai` instead of the phone timezone → notification fired during sleeping time. Fix: derive tz from phone location/timezone for all activities.
- **ES-001 approved** (owner answered all 5 questions) — spec updated (§2 v1 passive-only, §3 overrides, new §3.1 tick semantics, §6 read-only, §8 resolved). P1-12 → **In Progress**.
- Created **ES-004 (API authentication)** spec + **P0-05** (Blocked pending approval). ES-001 v1 must not add public write endpoints until ES-004 lands.
- P1-13/P1-14 remain Blocked (ES-002/ES-003 still Draft, pending owner answers).
- **ES-001 v1 implemented** (configurable habits: migration+seed, `GET /api/habits`, config-driven collector reminders, read-only settings view) → P1-12 In Review. Collector build **v1.0.10** (code 11).

### 2026-10-14 (session 2)
- Adopted Dev Response 1014: reminders → Android collector (P1-09); cron (P1-02) → **Won't Do**; P1-01/P1-03 → In Progress.
- **B-16** implemented (daily scoping via `lib/timezone.ts`); In Review pending owner cross-midnight check.
- Created P1-09, P1-10, P1-11, **P1-12 (self-upgrade review — dedicated session)**.
- `AGENTS.md` finalized v1.3.
- Removed duplicate `/api/summary` (replaced by P1-11's `/api/summary/today`).
- **P1-09** implemented (collector generates + delivers reminders); In Review pending device check. Collector build **v1.0.9** (code 10).
- **P1-10** implemented (steps display on PWA home); In Review, production-verified.
- **P1-11** implemented (daily summary v1 + chat brief); In Review, production-verified.
- **Self-upgrade interim** (owner, 2026-10-14): web auto-deploy is live; Google Play upload stays **manual** until the P1-12 dedicated session.

### 2026-10-14 (session 1)
- Sprint v2 landed: P0-01 sit removal; B-15 duration fix; P1-01..P1-08.
- Vercel CI deploy loop restored (`.github/workflows/deploy.yml`).
- Collector v1.0.8 (minSdk 24 + HealthConnect).

### 2026-03-17
- Sprint v2 opened.

---

## Metrics We Track (Lightly)

| Metric | Current | Target | Notes |
|---|---|---|---|
| Days owner opened PWA (last 7) | — | 5+ | Presence |
| Signals logged (last 7 days) | — | 15+ | Interaction |
| Reminders acted on | — | 40%+ | Value |
| Reminders dismissed | — | <30% | Friction |
| 元婴 "我不知道" instances | >0 | >0 | Honesty |

---

**End of TRACKING.md**

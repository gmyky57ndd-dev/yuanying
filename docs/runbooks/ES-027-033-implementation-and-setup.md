# Yuanying Input — ES-027 to ES-033 Implementation, Setup & Validation

**Purpose**: A single factual reference for 元婴 (and the owner) describing what
was implemented, what remains to be configured, and how to validate it.

**Last updated**: 2026-10-19
**Branch**: `es-029-model-router` (ES-027–ES-033 changes are not all committed)
**Tracking**: `TRACKING.md`

> **Status truth**
> - **Implemented**: ES-027, ES-028, ES-029, ES-030, ES-031.
> - **Approved, not implemented**: ES-032, ES-033 (specs + tracking only).
> - **Pending verification chore**: ES-034 (data portability dry run).
>
> 元婴 must not claim ES-032/ES-033 capabilities as available.

---

## 1. Feature Summary

| ID | Feature | Status | Tracking |
|---|---|---|---|
| ES-027 | Daily summary tone: meaning, "we", draft then ask to save | Implemented | P2-11 |
| ES-028 | Context before judgment for partial data (e.g. phone vs watch steps) | Implemented | P1-58 |
| ES-029 | Model router + provider abstraction + model Settings UI | Implemented | P2-12 |
| ES-030 | Google Drive read-only import tool + OAuth | Implemented; phone OAuth pending credentials | P2-13 |
| ES-031 | Data sovereignty: weekly DB snapshot + authenticated ZIP export | Implemented; first workflow run pending secret | P2-14 |
| ES-032 | Commitments, safe drafts, semantic search, external reader | Spec approved; not implemented | P2-16 |
| ES-033 | Legacy ingestion (Stalio + Blinking Notes) | Spec approved; not implemented | P2-17 |
| ES-034 | Data portability dry run against non-Supabase Postgres | Spec approved; not run | P2-15 |

---

## 2. What Each Implemented Feature Does

### ES-027 — Summary tone (partner, not QA)

**Behavior**

- The daily summary focuses on what the work *means* for the project or the
  owner's state, not a list of technical checks.
- It speaks as "we" / "I" (元婴), not only "you" (Owner).
- It drafts the summary first, then asks "Shall I save this?" (要我存下来吗？)
  instead of offering an empty menu.

**Files**

- `lib/summary-generator.ts` — exports `SUMMARY_TONE_RULES`.
- `lib/yuanying.ts` — injects those rules into `## Daily Summaries`.

**Spec**: `docs/specs/ES-027-elevate-summary-tone.md`.

### ES-028 — Context before judgment

**Behavior**

- No behavioral judgment ("you barely moved", "you didn't drink enough") from a
  single aggregate number.
- If a value looks unusual, check provenance (source, window).
- If only one source is visible, state: "I only see data from X. Is Y synced?"
- Use "I see [number] from [source]" and let the owner draw the conclusion.

**Files**

- `core/fenshen/xiaowu/profile.md` — the rule.
- `core/system-manifest.md` — the rule for every Fenshen.
- `lib/yuanying.ts` — loads `core/fenshen/<id>/profile.md` for the active
  Fenshen.

**Known conflict**: `core/voice.md` still has the example
`Steps: 0/5000 → 今天还没动。` This contradicts ES-028 and should be fixed in a
follow-up.

**Spec**: `docs/specs/ES-028-context-before-judgment.md`.

### ES-029 — Model router & provider abstraction

**Behavior**

- Models live in the `models` table; the active model is
  `config.active_model_id`.
- Supported providers: `deepseek`, `openai`, `anthropic`, `custom`
  (OpenAI-compatible: OpenRouter, Ollama, etc.).
- API keys are stored server-side and are never returned by `/api/models`.
- Settings → 模型 can list, add, activate, test, and delete models. The active
  model cannot be deleted.
- Chat uses the active model through the AI SDK (`streamText`) instead of a
  hardcoded DeepSeek fetch.
- If the model is missing, the key is wrong, or the provider is unsupported,
  the chat returns an explicit error instead of inventing a reply.

**Files**

- `supabase/migrations/017_models.sql` + `supabase/schema.sql`.
- `lib/llm-router.ts`.
- `app/api/models/route.ts` (list/add/activate/delete).
- `app/api/models/test/route.ts` (ping).
- `app/settings/page.tsx` (Models UI).
- `app/api/chat/route.ts` (router + AI SDK streaming tools).
- `lib/api.ts` (data-stream consumer).

**Dependencies**: `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `zod`.

**Spec**: `docs/specs/ES-029-model-router.md`.

### ES-030 — Google Drive read-only import

**Behavior**

- OAuth 2.0 with only `https://www.googleapis.com/auth/drive.readonly`.
- Settings → **Google Drive（只读）** can authorize and disconnect.
- Chat tool `get_drive_doc(file_id)` accepts a Drive file ID or URL.
- Google Docs are exported as `text/plain` via `files.export`; text files use
  `alt=media`.
- Imported text is saved as a note with:
  - `signals.name='note'`
  - `source='google_drive'`
  - `context.file_id`, `context.file_url`, `context.imported_at`
- Re-importing the same file returns the existing note (`already: true`).
- Read-only: no Drive write, delete, or share calls.

**Important**: this repository has no separate `notes` table. Notes are stored
in `signals` with `name='note'`.

**Files**

- `supabase/migrations/018_google_drive.sql`.
- `lib/google-drive.ts`.
- `app/api/integrations/google-drive/route.ts` (status/disconnect).
- `app/api/integrations/google-drive/authorize/route.ts`.
- `app/api/integrations/google-drive/callback/route.ts`.
- `app/api/chat/route.ts` (`get_drive_doc` tool).
- `app/settings/page.tsx`.
- `middleware.ts` (callback is public; OAuth `state` cookie is the CSRF guard).

**Spec**: `docs/specs/ES-030-google-drive-read-tool.md`.

### ES-031 — Data sovereignty & backup

**Behavior**

- `AGENTS.md` §12: the database is a cache; local Markdown/Git is the truth.
- Weekly GitHub Actions job dumps Supabase to
  `backups/db/YYYY-MM-DD.sql` and commits it.
- Settings → **数据主权 → 导出我的元婴** downloads a ZIP.
- ZIP contains:
  - `yuanying-data-export.json` — exported DB tables + manifest.
  - `core/**` — identity, rules, habits, prompts, and conversation memory.
  - `README.txt` — export metadata and restore outline.
- Excluded from the ZIP: `models.api_key`, `google_oauth_tokens`.
- `/api/export` requires a session cookie or
  `Authorization: Bearer <API_TOKEN>`; it does not rely on the optional
  `AUTH_ENFORCE` flag.

**Files**

- `AGENTS.md` §12.
- `.github/workflows/db-backup.yml`.
- `app/api/export/route.ts`.
- `app/settings/page.tsx`.
- `jszip` dependency.

**Spec**: `docs/specs/ES-031-data-sovereignty.md`.

### ES-032 / ES-033 — Approved, not implemented

- **ES-032**: `create_commitment`, `draft_communication`,
  `semantic_search` (pgvector), `fetch_external_doc`. No commitments/drafts
  tables, no pgvector, no send UI yet.
- **ES-033**: `npm run import:legacy` for Stalio and Blinking Notes, with
  provenance, idempotency, batching, and `--dry-run`. No import script yet.

**Specs**: `docs/specs/ES-032-capability-expansion.md`,
`docs/specs/ES-033-legacy-data-ingestion.md`.

### ES-034 — Dry run pending

- Export the weekly SQL dump, import it into Docker/Neon Postgres, point the app
  at `DATABASE_URL`, and verify reads/writes without Supabase.
- The current app still uses `@supabase/supabase-js`; a lightweight DAL is
  required before this can pass.

**Spec**: `docs/specs/ES-034-data-portability-dry-run.md`.

---

## 3. Setup Still Needed

### 3.1 Supabase migrations

Already applied to the configured Supabase:

```bash
node --env-file=.env.local scripts/db.mjs supabase/migrations/017_models.sql
node --env-file=.env.local scripts/db.mjs supabase/migrations/018_google_drive.sql
```

For a fresh environment, apply the full `supabase/schema.sql` or both
migrations above.

### 3.2 Google Cloud / Drive OAuth

Required for ES-030:

1. Open https://console.cloud.google.com and select/create a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** → External.
   - Add scope `https://www.googleapis.com/auth/drive.readonly`.
   - If the app is in Testing, add the owner's Google account as a test user.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
5. Add the authorized redirect URI exactly:
   ```
   https://yuanying-rust.vercel.app/api/integrations/google-drive/callback
   ```
6. Copy the Client ID and Client Secret.

Add these to Vercel (Production and Preview as needed) and `.env.local`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://yuanying-rust.vercel.app/api/integrations/google-drive/callback
```

Do not paste secrets into chat, docs, or Git. Redeploy after changing Vercel
env vars.

### 3.3 GitHub Actions backup secret

Required for ES-031:

- GitHub → repository → Settings → Secrets and variables → Actions →
  New repository secret.
- Name: `SUPABASE_DB_URL`
- Value: the Supabase direct Postgres connection string (not the anon or
  service-role API key).

Without it, `Weekly DB Backup` fails loudly.

### 3.4 Model provider keys

- DeepSeek continues via `DEEPSEEK_API_KEY` when the `models` row has no key.
- Optional fallbacks: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.
- Or store per-model keys through Settings → 模型 (server-side only).

### 3.5 Deploy

- Commit/push the current changes on `es-029-model-router`.
- Merge to `main` to trigger the Vercel deploy workflow.
- Confirm the deployment is green before phone validation.

---

## 4. Validation Checklist

### ES-027 — Summary tone

- [ ] Ask in chat: "看今天的简报" / "how was my day".
- [ ] The reply starts with a reflective sentence, not a QA list.
- [ ] It uses "we"/"I", not only "you".
- [ ] It drafts the summary and ends with "要我存下来吗？" / "Shall I save this?".
- [ ] It does **not** ask an empty menu like "要写进去吗？".

### ES-028 — Context before judgment

- [ ] Simulate or recall a low phone step count with a watch source present.
- [ ] 元婴 says "I see [number] from [source]" and asks whether another source
      is synced.
- [ ] It does **not** say "you barely moved" or "you need to walk more" from a
      single aggregate.

### ES-029 — Model router

- [ ] Settings → 模型 lists `deepseek-chat`.
- [ ] Add a model (provider, model name, key, optional base URL).
- [ ] Activate it; the radio selection persists after reload.
- [ ] Click **测试** → returns `可用` / success.
- [ ] Send a chat message; the reply uses the active model.
- [ ] Delete a non-active model; the active model cannot be deleted.
- [ ] Break the key or activate a missing model → chat shows an explicit error,
      not a fabricated answer.
- [ ] DeepSeek still works with the env-key fallback.

### ES-030 — Google Drive

- [ ] Vercel has `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
      `GOOGLE_REDIRECT_URI`.
- [ ] Google Cloud redirect URI matches exactly.
- [ ] On the phone, open `/settings` → **授权 Google Drive** → grant access.
- [ ] Settings shows **已连接 · 只读权限**.
- [ ] In chat, send:
      `https://drive.google.com/file/d/1yFAtaqyaQo8224mVjb8m2939ESqxTKTt/view`
      and ask 元婴 to read/summarize it.
- [ ] The tool result succeeds and the reply summarizes the document.
- [ ] Verify the saved note:
      ```sql
      select id, source,
             context->>'file_id' as file_id,
             context->>'file_url' as file_url,
             left(value->>'text', 80) as preview
      from signals
      where source = 'google_drive'
      order by created_at desc
      limit 5;
      ```
- [ ] Re-send the same link → no duplicate note (`already: true`).
- [ ] Disconnect Drive → the next import returns "not connected", not a fake
      success.
- [ ] Optional negative test: a Drive URL the account cannot access → explicit
      error.

### ES-031 — Backup & export

- [ ] `SUPABASE_DB_URL` secret exists in GitHub Actions.
- [ ] Run **Weekly DB Backup** manually (Actions → Run workflow).
- [ ] A file `backups/db/YYYY-MM-DD.sql` is committed.
- [ ] Verify the dump is non-empty and contains known tables.
- [ ] In Settings → **数据主权**, tap **导出我的元婴** while logged in.
- [ ] The ZIP downloads on the phone.
- [ ] Unzip and confirm:
      - `yuanying-data-export.json`
      - `core/identity.md`, `core/voice.md`, etc.
      - `models` entries have no `api_key`
      - no `google_oauth_tokens` table
- [ ] `GET /api/export` without auth returns `401`.
- [ ] `GET /api/export` with `Authorization: Bearer <API_TOKEN>` returns
      `application/zip`.

### ES-032 / ES-033 / ES-034

- [ ] ES-032: not testable yet; do not claim commitments/drafts/semantic search
      are available.
- [ ] ES-033: not testable until the owner provides Stalio/Blinking export
      samples and the `import:legacy` script is implemented.
- [ ] ES-034: run the dry run after the first SQL snapshot exists; record the
      timing and DAL changes in `TRACKING.md`.

---

## 5. Quick Commands

```bash
# typecheck / lint / build
npx tsc --noEmit
npm run lint
npm run build

# apply migrations (already applied in the configured Supabase)
node --env-file=.env.local scripts/db.mjs supabase/migrations/017_models.sql
node --env-file=.env.local scripts/db.mjs supabase/migrations/018_google_drive.sql

# export check (do not echo the token)
set -a; source .env.local; set +a
curl -s -o /tmp/yuanying-export.zip \
  -H "Authorization: Bearer $API_TOKEN" \
  http://localhost:3000/api/export
unzip -l /tmp/yuanying-export.zip
```

---

## 6. Current Known Limitations

- ES-030 end-to-end phone authorization is blocked until Google OAuth
  credentials and the redirect URI are configured.
- ES-031 first scheduled backup is blocked until `SUPABASE_DB_URL` is added to
  GitHub Actions.
- ES-032 and ES-033 are approved but **not implemented**.
- ES-034 is a pending verification chore; the app still depends on the Supabase
  SDK.
- `core/voice.md` contains an example that conflicts with ES-028.
- The export runs inside a 60-second serverless limit; the weekly SQL snapshot
  remains the authoritative full backup.
- The current working tree includes uncommitted changes on
  `es-029-model-router` (ES-030 and ES-031/032/033/034 work).

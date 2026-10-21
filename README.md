# 元婴 (Yuanying)

> Not a chatbot. Not an assistant. Your second self, growing with you.

元婴 is a phone-first AI companion that captures signals (wake, sleep, water,
steps, activity), offers reminders, and keeps a memory of its owner over time.
It is one **Core State** (memory + signals) that manifests through configurable
**interfaces** (Fenshen), using agentic tools to retrieve data and to take
owner-confirmed actions.

- **Production PWA:** <https://yuanying-rust.vercel.app>
- **Rules for contributors/agents:** [`AGENTS.md`](./AGENTS.md)
- **Live status & acceptance criteria:** [`TRACKING.md`](./TRACKING.md)
- **Engineering spec index:** [`docs/specs/INDEX.md`](./docs/specs/INDEX.md)

---

## Architecture

| Piece | Where | What it does |
|---|---|---|
| PWA (Next.js 14) | `app/`, `components/`, `lib/` | Chat, signals, notes, history, settings, avatar stage |
| Android collector | `collector/` (Kotlin/Java) | HealthConnect steps, app usage, reminder **generation + delivery**, offline PWA lifesaver |
| Database | Supabase (`supabase/schema.sql`, `supabase/migrations/`) | Signals, notes, messages, summaries, reminders, config, fenshen, models |
| LLM | DeepSeek via Vercel AI SDK | Chat, tools, summaries; routed through `lib/llm-router.ts` |
| MCP bridge | `mailbox/`, `mcp-config.json`, `app/api/mcp` | Lets Claude Desktop / Cursor / other agents read and write 元婴's context |
| Core files | `core/` | Identity, voice, values, ground rules, system manifest, opinions, memory |

The runtime prompt is assembled from `core/*.md` (`lib/yuanying.ts`), so changes
to identity, voice, or the system manifest take effect without a code change.
`core/system-manifest.md` must be updated whenever a user-facing surface or tool
changes — see `AGENTS.md` §2.5.

---

## Quick start

Requirements: **Node 20+**, a Supabase project, a DeepSeek API key.

```bash
npm install
cp .env.example .env.local     # then fill in the values below
npm run dev                    # http://localhost:3000
```

Apply the schema to a fresh Supabase project:

```bash
npm run db:apply               # runs supabase/schema.sql through SUPABASE_DB_URL
```

Apply a migration by hand (one file at a time, in order):

```bash
node --env-file=.env.local scripts/db.mjs supabase/migrations/017_models.sql
```

Run the checks:

```bash
npm test                       # node test runner: lib/*.test.ts
npm run lint
npx tsc --noEmit
```

---

## Environment variables

Set these in **`.env.local`** for local development and in **Vercel → Settings →
Environment Variables** for production. Values are never committed.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side Supabase access |
| `DEEPSEEK_API_KEY` | yes* | Default model key (*or a key stored on the `models` row) |
| `SUPABASE_DB_URL` | local + CI | Direct Postgres URL for migrations and the backup workflow |
| `SUPABASE_DB_PASSWORD` | local | DB password (used to build `SUPABASE_DB_URL`) |
| `OWNER_PASSWORD` | production | PWA login password |
| `API_TOKEN` | production | Bearer token for the collector and MCP clients |
| `SESSION_SECRET` | production | Signs the 30-day PWA session cookie |
| `IP_SALT` | production | Salt for hashed IPs in `auth_events` |
| `AUTH_ENFORCE` | production | `false` during the ES-004 grace; `true` rejects unauthenticated API calls |
| `CRON_SECRET` | optional | Guards `/api/cron/*` |
| `GITHUB_TOKEN` / `GITHUB_REPO` | optional | Push-to-GitHub feedback issues and `write_markdown` commits |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | optional | Google Drive read-only import (ES-030) |
| `TAVILY_API_KEY` | optional | Web search; falls back to DuckDuckGo when absent |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | optional | Alternative providers for the model router |
| `MCP_TOKEN` / `MCP_EXTERNAL_URL` / `MCP_EXTERNAL_TOKEN` | optional | MCP server auth and external-agent bridge |

GitHub Actions secrets live in **repo → Settings → Secrets and variables →
Actions**: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
`SUPABASE_DB_URL`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, and optionally
`PLAY_SERVICE_ACCOUNT_JSON` for Play uploads.

---

## Deployment

### Web (PWA)

Push to `main` → [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
runs `vercel deploy --prod`. Doc-only changes (`TRACKING.md`, `docs/**`) are
skipped by `paths-ignore`, so tracking updates do not redeploy.

A Vercel Git integration may also deploy independently; both paths are safe.

### Android collector

Releases are tag-driven:

```bash
git tag v1.0.32
git push origin v1.0.32
```

[`.github/workflows/android-release.yml`](./.github/workflows/android-release.yml)
builds a signed AAB/APK, publishes a GitHub Release, and — when
`PLAY_SERVICE_ACCOUNT_JSON` is set — uploads to the Play **internal** track with
`status: completed` (drafts are never rolled out; see TRACKING P1-15).

The collector checks the latest GitHub release for updates and shows the
installed version in its UI. The PWA shows both versions under Settings.

### Database

`schema.sql` is the current shape; `supabase/migrations/*.sql` are the forward
migrations. Never truncate data as a shortcut (`AGENTS.md` §3).

---

## Backups & data ownership

Three layers (`AGENTS.md` §12, ES-031):

1. **Daily Git memory** — `.github/workflows/memory-backup.yml` commits `core/`
   and `memory/` every day at 00:00 Asia/Shanghai.
2. **Weekly DB snapshot** — `.github/workflows/db-backup.yml` runs `pg_dump`
   every Sunday and commits `backups/db/YYYY-MM-DD.sql`.
3. **Owner export** — `GET /api/export` (Settings → 导出我的元婴) returns a ZIP
   of all user tables plus `core/**`, excluding `models.api_key` and OAuth tokens.

Restore steps: `docs/specs/ES-031-data-sovereignty.md` §6.

---

## MCP bridge

`POST /api/mcp` exposes notes, conversations, summaries, external chats,
mailbox files, and body status to external agents. `mcp-config.json` is the
client config; `mailbox/` is the shared file drop. Runbook:
`docs/runbooks/mcp-bridge.md`.

---

## Repository map

```text
app/            Next.js routes and pages
components/     UI (chat, habit grid, avatar stage, settings panels)
lib/            Domain logic: prompts, tools, routers, parsers, timezone
core/           Identity, voice, values, ground rules, manifest, memory, opinions
collector/      Android app (Kotlin/Java)
supabase/       schema.sql + numbered forward migrations
docs/           specs (INDEX.md), runbooks, help, PM inbox
mailbox/        MCP file exchange
scripts/        db, import, inbox, opinions CLI helpers
```

## Further reading

- `docs/runbooks/` — deploy, tests, MCP, PWA restore, ES-004 enforcement
- `docs/help/` — owner-facing help (model router, etc.)
- `docs/specs/INDEX.md` — every engineering spec, ES-001 → ES-053
- `docs/yuanying-prd-v1.1.md.md`, `docs/yuanying-engineering-spec-v2.md.md` —
  product requirements and the original engineering spec

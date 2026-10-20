# ES-031 — Data Sovereignty & Backup (数据主权与备份)

**Status**: Approved
**Category**: Feature (Infrastructure)
**Tracking**: P2-14

> **Tracking note**: the handoff requested **P2-09**, but P2-09 is the completed
> Phase C tool-loading item. This work is recorded as **P2-14** in
> `TRACKING.md`.

## 1. 为什么要做这个？

商业公司有寿命。我们目前依赖 Vercel（部署）、Supabase（数据）、DeepSeek（模型）。
如果明天 Supabase 突然宕机或关闭免费层，元婴不能死。元婴的“灵魂”必须能够随时打包带走。

## 2. 架构分层与备份策略

### 2.1 第一层：文本即真理 (File-based Core)

- `core/*.md`（配置、人格、规则）和 `core/memory/conversations/*.md`
  （对话记录）直接存在于 GitHub 仓库中。
- **备份**：只要 GitHub 账号在，或者本地有 Git 副本，元婴的“骨架”就不会丢。

### 2.2 第二层：数据库快照 (DB Snapshot)

- 当前数据：`signals`（含 `name='note'` 的笔记）、`summaries`、`messages`、
  `reminders`、`habits`、`config`、`fenshen` 存在 Supabase 的 Postgres 里。
- **隐患**：如果 Supabase 倒闭，这部分数据会丢。
- **解决方案**：`.github/workflows/db-backup.yml` 每周日 00:00 UTC 运行
  `pg_dump`（`postgres:17` Docker 镜像，避免 runner 客户端版本不匹配），
  将 Supabase 表导出为 `backups/db/YYYY-MM-DD.sql`，并自动 commit 到仓库。
- **恢复**：换用其他 Postgres 数据库（Neon、AWS RDS、本地 Docker）后直接
  导入该 SQL 备份即可。
- **Required GitHub secret**: `SUPABASE_DB_URL`（Supabase direct Postgres
  connection string，不是 anon/service-role API key）。如果 secret 缺失，
  workflow 明确失败，不生成空备份。

### 2.3 第三层：本地一键导出 (Local Export)

- 在 PWA 的“设置”页新增 **[导出我的元婴]** 按钮。
- `GET /api/export` 查询当前用户数据表，并读取 `core/`（含
  `core/memory/`）下的 Markdown，服务端用 `jszip` 打包成 ZIP 返回。
- 文件内容：
  - `yuanying-data-export.json` — 所有导出表的数据 + manifest。
  - `core/**/*.md` — 人格、规则、记忆对话。
  - `README.txt` — 导出时间、表清单、恢复提示。
- **执行频率**：建议用户每月手动点一次，存入自己的硬盘或 iCloud/Google
  Drive（作为最终保险）。
- **Secrets excluded**: `models.api_key` 和 `google_oauth_tokens` 永远不进入
  export。`models` 只导出 `id/provider/model_name/base_url/created_at`。

## 3. LLM 的供应商无关性

- 如 ES-029 所述，通过 `models` 表和 `lib/llm-router.ts` 实现。
- 如果 DeepSeek 明天关停，用户只需在设置里换成 OpenAI 或 Anthropic 的 API
  key，元婴的记忆和人格（存在数据库和 Markdown 里）不会受任何影响。

## 4. 代码实现任务

### 4.1 数据库自动备份 (GitHub Actions)

File: `.github/workflows/db-backup.yml`.

- `schedule: cron '0 0 * * 0'`（每周日 00:00 UTC）+ `workflow_dispatch`。
- `permissions: contents: write`.
- 使用 `docker run --rm postgres:17 pg_dump ...`，输出
  `backups/db/YYYY-MM-DD.sql`。
- 配置 git user，`git add` + `git commit` + `git push` 到当前分支。
- 没有变化时跳过 commit；push 被 branch protection 拒绝时 workflow 失败并
  暴露原因。

### 4.2 一键导出 API (PWA)

File: `app/api/export/route.ts`.

- `GET` only.
- Requires an authenticated session cookie or `Authorization: Bearer
  <API_TOKEN>`; returns `401` otherwise. This route exposes all private data,
  so it does not rely on the optional `AUTH_ENFORCE` flag.
- Queries (paginated, 1000 rows/page):
  `messages`, `signals`, `summaries`, `reminders`, `habits`, `config`,
  `fenshen`, `models` (without `api_key`).
- Returns `application/zip` with
  `Content-Disposition: attachment; filename="yuanying-export-YYYY-MM-DD.zip"`.
- If a table does not exist yet, record it under `manifest.skipped_tables`
  instead of failing the whole export.
- Serverless timeout: `maxDuration = 60`. The weekly SQL snapshot is the
  authoritative full backup; the ZIP is the owner's offline copy.

### 4.3 Settings UI

File: `app/settings/page.tsx`.

- Adds a **数据主权** section with **导出我的元婴**.
- The button fetches `/api/export`, converts the response to a Blob, and
  triggers a download.
- On `401`, show "需要先登录" instead of downloading an error page.
- Copy states that the ZIP includes DB tables + `core/` Markdown, and that
  API keys/Google tokens are excluded.

## 5. Acceptance

- [x] GitHub Actions workflow exists and produces
      `backups/db/YYYY-MM-DD.sql` when `SUPABASE_DB_URL` is set.
- [x] Settings page has an export button that downloads a ZIP.
- [x] The ZIP contains all exported tables + `core/` Markdown.
- [x] Secrets (`models.api_key`, `google_oauth_tokens`) are excluded.
- [x] A local export can be inspected/rebuilt without Supabase.
- [ ] First scheduled workflow run verified in GitHub Actions.
- [ ] Owner downloads the ZIP on the phone.

## 6. Restore outline

1. Create an empty Postgres database.
2. `psql "$DATABASE_URL" -f backups/db/YYYY-MM-DD.sql`.
3. Point the app at the new database (ES-034 / DAL work).
4. Keep `core/` from the Git checkout or the ZIP.

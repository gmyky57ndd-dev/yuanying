# Fenshen Playbooks v0.01 — 核心团队

**Date**: 2026-11-13
**Status**: Active. Seed: `node --env-file=.env.local scripts/seed-fenshen-v001.mjs`

Retired: **Elara**, **Kael** (rows + project maps removed).

## 团队

| Fenshen | 角色 | 工具白名单（实际启用） |
|---|---|---|
| 小悟 `xiaowu` | Supervisor / 项目经理 | `get_project_status`, `plan_actions`, `propose_work`, `ask_owner`, `configure_fenshen` |
| 拓维 `ai_pm` | 产品经理 | `web_search`, `read_local_file`, `write_local_file`, `push_to_dev`, `get_github_issue`, `get_project_status` |
| 阿构 `ai_architect` | 系统架构师 | `read_local_file`, `write_local_file`, `get_github_issue`, `get_project_status` |
| DSH `dsh` | 全栈工程师 | `read_code_file`, `read_local_file`, `write_local_file`, `get_github_issue`, `get_project_status`, `git_commit`, `submit_pr` (v0.02b) |
| 司测 `qa` | 质量保障 | `read_code_file`, `get_github_issue`, `create_bug_issue`, `get_project_status` |
| 镇岳 `devops` | 运维/部署 | `get_system_status`, `read_local_file`, `read_server_logs` (v0.02a) |
| 司书 `librarian` | 知识库管理员 | `search_local_kb`, `read_local_file`, `write_local_file`, `web_search` |

`get_system_status` is always appended server-side.

## 房间

- `yuanying`: 全员（lead 小悟）
- `bwp`: ai_pm / ai_architect / dsh / qa（lead ai_pm）
- `aso`: ai_pm / ai_architect（lead ai_pm）

## 模型配置（灵活）

- `fenshen.model_name = null` → 全局 `config.active_model_id`；不写死角色模型。
- API:
  - `POST /api/models` 新增模型（provider / model_name / api_key / base_url）
  - `PUT /api/models` 切换全局 `active_model_id`
  - `PUT /api/fenshen/config` 设置某分身 `model_name`（`null` 恢复默认）
- Chat: 小悟可调用 `configure_fenshen` 设置任意分身的 model/prompt/tools/enabled。
- UI: Desktop 设置中的模型下拉。

实测：`configure_fenshen(dsh, deepseek-chat)` 写入成功，随后恢复 `null`。

## v0.01 未启用的工具（需 Owner 批准后设计）

`run_terminal_command`, `git_commit`, `submit_pr`, `run_test_suite`,
`deploy_to_coolify`, `update_env_vars`, `read_server_logs`,
`write_code_file`, `local_rag_search`（用 `search_local_kb` 替代）,
`read_obsidian_vault`（用 `read_local_file` 替代）, `web_fetch`（用 `web_search` 替代）,
`check_server_health`（用 `get_system_status` 替代）.

这些涉及代码执行、Git 写操作或生产部署，不能在没有审批/沙箱设计的情况下直接接入。

## Workflow

`AGENTS.md` §14：需求 → PRD → ADR（Owner 批准）→ 实现 → QA → 部署（Owner 确认）。

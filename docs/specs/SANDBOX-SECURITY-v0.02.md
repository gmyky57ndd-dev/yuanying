# v0.02 沙箱安全设计（高危工具）

**状态**: Owner 已批准（2026-11-13）。v0.02a（read_server_logs）、v0.02b（git_commit/submit_pr）与 v0.02c（workspace runner）已实现；部署/环境变量未写代码。
**范围**: 8 个未启用工具：`git_commit`、`submit_pr`、`run_terminal_command`、`run_test_suite`、`write_code_file`、`deploy_to_coolify`、`update_env_vars`、`read_server_logs`。

## 0. 原则

1. **最小权限**：每个工具只做一件事，参数尽量窄。
2. **不碰本地 .git**：所有 Git 写操作走 GitHub REST API，Mac 上的 `.git` 保持只读。
3. **代码执行必须隔离**：固定 workspace + 命令白名单 + 超时 + 输出上限。
4. **生产变更双确认**：模型不能直接部署；Owner 在 UI 红色弹窗点击确认后才执行。
5. **全链路审计**：每次调用记录 `request_id`、approval_id、参数摘要、结果、耗时。
6. **失败安全**：默认拒绝；白名单之外、路径越界、密钥命中一律拒绝。

## 1. 工具矩阵

| 工具 | 允许 | 禁止 | 确认 |
|---|---|---|---|
| `git_commit` | ✅ v0.02b：GitHub Contents API 创建 branch/commit | 本地 `.git`、force push、改 main | approval_id + issue |
| `submit_pr` | ✅ v0.02b：REST 创建 PR | merge、force、改保护分支 | approval_id + CI |
| `run_terminal_command` | ✅ v0.02c：workspace + argv 白名单 | shell 拼接、`rm`、`sudo`、`curl` 任意 URL | approval_id |
| `run_test_suite` | ✅ v0.02c：`npm test` / `test:e2e` 包装 | 任意脚本、网络任意域名 | approval_id |
| `write_code_file` | ✅ v0.02c：workspace 内代码文件 | `.git`、`.env`、密钥、绝对路径 | approval_id |
| `deploy_to_coolify` | Coolify webhook（预配置） | 模型直接调用、无 UI 确认 | Owner 红色弹窗 |
| `update_env_vars` | 加密存储 + diff 预览 | 明文日志、无确认 | Owner 弹窗 |
| `read_server_logs` | ✅ v0.02a 已接入：只读 tail + 脱敏 | 下载全量、写操作 | 只读 |

## 2. Git：只走 GitHub API

- `git_commit`：
  - 输入：`project_id`、`branch`、`path`、`content`、`message`、`approval_id`。
  - 服务端用 GitHub Contents API `PUT /repos/{owner}/{repo}/contents/{path}` 创建/更新文件；branch 从 `main` 的 SHA 创建。
  - 禁止路径：`.git/**`、`.env*`、`**/*secret*`、`node_modules/**`。
  - 不执行 `git` 二进制，不读取/写入本地 `.git`。
- `submit_pr`：
  - 输入：`head`、`base`（默认 main）、title、body、approval_id。
  - `POST /repos/{owner}/{repo}/pulls`；禁止 merge；要求 CI 通过后 Owner 手动合并。
  - PR 模板包含：变更摘要、测试证据、回滚计划、关联 Issue。
- 分支命名：`agent/<project>/<approval_id>-<slug>`；同名冲突拒绝。

## 3. 代码执行：workspace + 白名单

- 根目录：`~/yuanying/workspace/<project_id>`；所有路径经 `realpath` 校验，禁止 `..`、绝对路径、符号链接逃逸。
- 独立 runner（本地 Unix socket），不以 Next 主进程执行；子进程 uid 隔离；macOS `sandbox-exec` profile：
  - 只允许读写 workspace；
  - 禁止访问 `~/.ssh`、Keychain、`.env`、`~/Library`；
  - 默认无网络，npm 安装需显式 `allow_network=true` + Owner 策略。
- `run_terminal_command` 参数是 **argv 数组**，不经过 shell：
  - 白名单：`npm install`、`npm ci`、`npm run test`、`npm run lint`、`npm run build`、`git status`、`git diff`、`ls`、`pwd`、`node --version`。
  - 禁止：`; | & > < $() \``、`rm`、`sudo`、`chmod`、`curl`、`wget`、`ssh`、`scp`。
  - 超时 120s，输出上限 200KB，超限截断。
- `run_test_suite` 是白名单包装，不允许自定义命令；解析 exit code/测试摘要。

## 4. 生产部署：Webhook + 红色确认

- `deploy_to_coolify` 不接受模型直接调用；只能在 UI 触发。
- 流程：
  1. 镇岳生成部署计划（版本、变更、回滚）；
  2. UI 弹出全屏红色弹窗「生产环境发布审批」，显示计划 + 影响范围；
  3. Owner 输入确认短语（如 `DEPLOY <project> <version>`）并点击；
  4. 后端一次性 token 调用 Coolify webhook；
  5. 记录审计 + 部署结果；失败自动回滚提示。
- 模型只能准备计划，不能点击确认。
- `update_env_vars` 同 UI 确认；值加密存储，日志脱敏；显示 diff（隐藏值）。

## 5. 日志与审计

- `read_server_logs`：只读 `tail -n`，按项目过滤，脱敏 `token|key|secret|password|authorization`；最大 500 行；不返回完整文件。
- 所有工具事件写 `system_events`：`tool`、`approval_id`、`ok`、`error_type`、`duration_ms`、参数摘要（不含密钥）。
- 拒绝原因：`whitelist_denied`、`path_denied`、`command_denied`、`approval_required`、`owner_confirmation_required`。

## 6. 威胁模型

| 威胁 | 缓解 |
|---|---|
| Prompt injection 让 DSH 执行 `rm -rf` | argv + 命令白名单 + 沙箱 + 默认拒绝 |
| 路径穿越读 `~/.ssh` | realpath + workspace 根校验 + sandbox profile |
| 密钥进入日志/PR | 路径/内容扫描 + 日志脱敏 + 提交前 secret scan |
| 模型直接部署 | 部署只接受 UI 一次性 token，工具不可调用 |
| 供应链脚本 | `npm install` 需网络策略；lockfile 校验；CI |
| 审计缺失 | 全量 system_events + approval_id 关联 |

## 7. 分阶段实施

- **v0.02a**：`read_server_logs` 只读 + 脱敏（低风险）。
- **v0.02b**：GitHub API `git_commit` / `submit_pr`（不碰本地 .git）。
- **v0.02c**：runner + `run_terminal_command` / `run_test_suite` / `write_code_file`。
- **v0.02d**：Coolify webhook + 红色发布弹窗 + `update_env_vars`。

每个阶段独立 Owner 批准，不一次性全开。

## 8. 验收门槛（实现前）

- [ ] Owner 批准本设计；
- [ ] runner 隔离方案在 Mac 上验证（workspace 外读取被拒）；
- [ ] 命令白名单绕过测试（`;`、`$()`、`..`、绝对路径）全部拒绝；
- [ ] GitHub API 分支/PR 在测试仓库跑通，且本地 `.git` 无写入；
- [ ] 部署 webhook 只能在 UI 触发，模型调用被拒；
- [ ] 审计事件完整，密钥不出现在日志。

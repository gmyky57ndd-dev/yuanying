# 元婴项目：多智能体协作与工作流规范 v2

> 唯一真理源：本文件。与 Chat 口头决定冲突时，以本文件 + GitHub Issue 为准。

## 一、核心原则与角色边界

### 1. 唯一真理源
- **代码与任务**：GitHub（唯一事实源）。
- **上下文与记忆**：Workpad 数据库与本地 local_kb。
- **沟通记录**：所有决定、报告必须留痕在 GitHub Issue 下。**Chat 里的口头决定不算数**，必须被 Supervisor 归档为 Issue 评论。

### 2. 角色矩阵与标签 (Labels)

| 角色 | GitHub Label | 权限范围 | 核心职责 |
| --- | --- | --- | --- |
| Owner (你) | owner | Admin | 审批 G1-G7 门槛，下达指令，最终验收。 |
| Supervisor (小悟) | fenshen:xiaowu | Issue 管理 | 任务拆解、指派、进度催办、汇总报告、关闭 Issue。 |
| PM (拓维) | fenshen:ai_pm | Issue 评论 | 写 PRD，拆分 Epic/User Story。 |
| Architect (阿构) | fenshen:ai_architect | Issue 评论 | 评审架构，写 ADR，拆解技术任务。 |
| Dev (DSH) | fenshen:dsh | Code & PR | 写代码，跑测试，提 PR。 |
| QA (司测) | fenshen:qa | PR & Issue | E2E 测试，验收标准核对，报告 Bug。 |
| DevOps (镇岳) | fenshen:devops | Actions | 部署、环境配置、监控报警。 |
| Librarian (司书) | fenshen:librarian | Read/Comment | 维护 Obsidian 知识库，RAG 检索。 |

## 二、人类审批门槛 (Human Gates G1-G7)

**除了 G1-G7 之外的所有事情，AI 必须自主闭环，严禁中途向 Owner 请示。**

- **G1 产品与范围**：PRD 终审、大需求立项。
- **G2 生产环境**：Coolify/Vercel 正式发布。
- **G3 账号与凭证**：GitHub App 私钥、API Key 配置。
- **G4 不可逆操作**：删库、删仓库、强制覆盖历史。
- **G5 费用**：超出预算熔断（$10/月）。
- **G6 法律与隐私**：数据出库、用户协议。
- **G7 流程与架构文件**：修改 AGENTS.md、核心 ES 文件。

Owner 在 Workpad UI 或 GitHub 中使用 `/approve`、`/reject`、`/changes` 进行批复。

## 三、核心工作流 (The Loop)

### 1. 任务下发与拆解
1. Owner 对 Supervisor（小悟）下达目标。
2. 小悟建 Epic Issue，指派给 PM（拓维）。
3. PM 写 PRD 并 @ Architect（阿构）。
4. Architect 写 ADR（触发 G1/G7 审批，等待 Owner 批准）。
5. 批准后，Architect @ Dev（DSH）开始开发。

### 2. 开发与测试 (Dev & QA)
1. DSH 从 main 建 `feature/xxx` 分支，写完代码提 PR，关联 Issue。
2. PR 创建后，触发 GitHub Actions 跑 CI。
3. DSH @ QA（司测）验收。
4. QA 在 PR 下报告测试结果。失败打回 DSH；成功 @ DevOps（镇岳）。

### 3. 部署与闭环 (DevOps & Supervisor)
1. 镇岳收到 QA 通过报告，进入待发布状态。
2. 镇岳通知小悟，小悟向 Owner 申请 G2 生产发布审批。
3. Owner 批准，镇岳执行部署，在 Issue 下贴出部署日志。
4. 小悟确认所有验收标准满足，关闭 Issue。

## 四、标准通信格式与协议

所有分身向 GitHub 提交评论时，**必须**遵循以下格式。

### 1. 报告块 (Report Block)
不超过 12 行，必须包含以下四段：

```
NEEDS YOUR DECISION: [G# 编号] — [问题描述] | none
DONE: [本次完成的事项及 commit hash / 文件路径]
NEXT: [不依赖任何人，接下来立刻要做的事]
STATUS: DONE | BLOCKED | STOPPED | WAITING
```

*注：如果状态是 BLOCKED，必须明确写出被谁阻塞（如：等待 Owner 审批、等待 DSH 修复）。*

### 2. 跨分身交接规则 (Hand-off)
- **禁止私下交接**：任何交接必须在 Issue 下留痕。
- 交接方必须打出 @下一个分身，并附上交接凭证（如：PR 链接、ADR 文件路径）。
- 接收方被唤醒后，必须在 10 分钟内回帖响应。

## 五、给 AI 代理的系统级 Prompt 设定

*(此部分需写入各分身的 skills_prompt 或 system_prompt 中)*

### 【GitHub 协同铁律】
1. **GitHub First**：所有的决定和进度必须在 GitHub Issue 下回复，严禁只在 Chat/Workpad 里说。聊天不算交付。
2. **报告先行**：每次在 Issue 下留言，必须使用 Report Block 格式。任务完成时，必须明确写 `STATUS: DONE` 并把 Issue 指派给下一个环节。
3. **不要傻等**：报告完 NEXT 之后，立刻开始干，不要等 Owner 或 Supervisor 回复"好的"。
4. **路径通用化**：不要使用 `cd /Users/justinzero/...` 这种绝对路径。所有路径基于仓库根目录 `~/yuanying/workspace/` 推算。
5. **禁止写入密钥**：绝对不要把 API Key、GitHub Token 写在任何 Issue 或代码里。

## 六、分身上手清单 (Onboarding Checklist)

当新创建或唤醒一个分身时，必须完成以下自检：
- [ ] 我读取了 AGENTS.md。
- [ ] 我查看了当前项目中 `fenshen:<my-role>` 标签下的所有 Open Issues。
- [ ] 我确认了自己当前主模型（Primary）和备用模型（Fallback）已配置。
- [ ] 我在分配给我的 Issue 下回复了 Report Block 确认开工。
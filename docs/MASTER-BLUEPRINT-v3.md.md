MASTER-BLUEPRINT-v3.md  
  
---  
  
# 《元婴多智能体工作台全局重构大图 v3.0》  
  
**项目**：元婴多智能体工作台 (Yuanying Workpad)  
**状态**：待全局评审 (Pending Global Review)  
**核心战略**：**Desktop First（桌面端优先）**，**Local-First（本地优先）**，**UI Configurable（全配置化）**。  
  
---  
  
## 一、 愿景升级：自我操作系统 (OS for the Self)  
  
元婴不再仅仅是一个聊天工具或伴侣，它是用户的**“自我操作系统”**。  
随着生活的推进，它必须能自我繁衍、自我组织：  
- **Life（生活）**：打卡、反思、身体监测、情绪陪伴。  
- **Workpad（工作台）**：多智能体（AI-PM、AI-Architect、DSH）协作，推进实际项目。  
- **Library（知识库）**：沉淀所有对话、旧文档、研究资料的本地真理库。  
  
---  
  
## 二、 UI/UX 架构评审与设计规范 (Mockup Critique)  
  
你提供的三张 UI 图极其出色，设计语言高度统一（水墨、清透、重留白），完美契合“元婴”的东方哲思。以下是评审意见与补充设计：  
  
### 1. 移动端（Mobile Hub）- 随身伴侣  
- **评价**：极简、克制。完美实现了“做减法”的初衷。头像居中，状态栏清晰，去除了复杂的配置。  
- **修正建议**：顶部的“生活/工作”切换按钮保留，但默认锁定在“生活”。如果用户在移动端误入 Workpad，应弹窗提示：“复杂配置请前往桌面端操作”。  
  
### 2. 桌面端（Desktop Hub）- 生产力中枢  
- **评价**：经典的三栏布局（导航/工作区/检视器）。左侧的“Projects、Workpads、Library、Fenshen”分类清晰；右侧的“Inspector（侧边检视器）”和“Playbook 预览”是点睛之笔，真正实现了“不用改代码，直接调教 AI”。  
- **修正建议（针对新增的 Library 与 Librarian）**：  
  - 在左侧边栏 **My Library（知识库）** 下，直接挂载 Obsidian 的入口（如一个 📂 图标）。  
  - 当选中 **Librarian（司书）** 时，右侧 Inspector 应显示其专属工具白名单（如 `local_rag_search`、`read_obsidian_vault`）。  
  
### 3. 新增设计规格：Library（知识库）与 Obsidian 的融合  
我们不需要重新造一个复杂的笔记编辑器，**直接拥抱 Obsidian 作为本地前端**。  
- **本地目录规范（必须严格隔离）**：  
  - `~/yuanying/local_kb/raw/`：原始资料（PDF、网页剪藏、长对话），只增不改。  
  - `~/yuanying/local_kb/wiki/`：用户用 Obsidian 写的双向链接笔记。  
  - `~/yuanying/local_kb/index.db`：SQLite FTS5 索引（可随时由代码重建）。  
- **交互逻辑**：在桌面端点击“My Library”，系统直接唤起本地的 Obsidian 客户端打开对应的 Vault。AI 通过 MCP 或本地 API 读取这些 Markdown 文件。  
  
---  
  
## 三、 核心对象模型与配置化架构  
  
整个系统必须完全由 Supabase 的配置表驱动，禁止硬编码。  
  
### 1. Project Template（项目模板）  
- 定义独立的协作空间。数据表（messages, artifacts）严格按 `project_id` 隔离。  
- **属性**：name, description, project_md (背景上下文), allowed_fenshen_ids。  
  
### 2. Fenshen Template（分身模板与 Playbook）  
- **定位**：可随时召唤的智能体。通过 UI 配置，无需发版。  
- **Playbook（行为指南）**：核心属性，包含 `system_prompt`（灵魂规则）、`model_provider`（引擎）、`tools_whitelist`（工具边界）。  
- **现存分身及定位**：  
  - **小悟 (Companion)**：情绪价值、生活打卡。  
  - **拓维 (AI-PM)**：业务解构、需求澄清、PRD 撰写。  
  - **阿构 (AI-Architect)**：第一性原理、系统拆解、代码架构评审。  
  - **司书 (Librarian)**：知识库管理、RAG 检索、资料摘要、本地文件读写。  
  - **DSH (Dev/Harness)**：编码实现、PR 提交、Bug 修复。  
  
---  
  
## 四、 底层架构与通信协议（四层大图）  
  
根据你提供的架构图，系统分为四层，核心原则是**“本地真理源，云端做缓存”**。  
  
1. **Client Layer（交互层）**：Tauri (Mac/PC) + PWA (Mobile)。  
2. **Router Layer（路由与组装层）**：  
   - `/api/chat` 接收请求。  
   - **Fenshen Router**：根据当前选择的 Fenshen，动态注入对应的 Prompt 和 Tools 白名单。  
   - **Events Logger**：全链路埋点，解决工具调用静默失败的问题。  
3. **Data & Memory Layer（数据与记忆层）**：  
   - **Local Truth（本地真理库）**：`~/yuanying/local_kb/`、SQLite FTS5。  
   - **Supabase（云端缓存）**：配置表、短期对话状态、用户画像（可选）。  
4. **Tools & External（外部能力层）**：  
   - LLM API 路由。  
   - GitHub Issue/PR 通信。  
   - Tool Executor（读写本地文件、发 Issue）。  
  
---  
  
## 五、 Agent 协作协议 (Human-in-the-loop)  
  
从“单打独斗”到“多智能体协同”，必须确立交接与审批协议：  
1. **共识机制**：用户（Boss）是唯一决策者。AI-PM 提出需求后，必须由 AI-Architect 给出技术架构（ADR），用户点击“批准”后，DSH 才能开始写代码。  
2. **上下文交接**：通过传递统一的 Markdown 文件（如 `PRD_V4.md`）和 GitHub Issue，将上下文无损传递给下一个 Agent。  
3. **工具隔离**：Fenshen 只能使用 Playbook 里配置的工具。比如，绝不允许 AI-PM 拥有 `write_code` 权限，也不允许 DSH 随意修改核心 `identity.md`。  
  
---  
  
## 六、 文档存储法则（单一事实来源）  
  
为了防止知识库膨胀和跨端混乱，严格区分三类文档：  
  
| 文档类型 | 存储位置（真理源） | 访问方式 | 特点 |  
| :--- | :--- | :--- | :--- |  
| **1. 核心记忆与知识库** | **本地 Mac** (`~/yuanying/local_kb/`) | 挂载 Obsidian，通过 MCP 检索 | 大文本、PDF、剪藏，绝不上传云端。 |  
| **2. 规范与设计文档 (ES/PRD)** | **GitHub Repo** (`docs/`) | Git 版本控制 | 需追踪、需和代码一起部署的文档。 |  
| **3. 沟通与任务流 (Issue/PR)** | **GitHub Issues** | 通过 `get_github_issue` 工具读取 | 临时性沟通、Agent 之间交接任务的战壕。 |  
  
---  
  
  
  

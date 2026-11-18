# 司书 / 个人图书馆：资料库形态与 Obsidian 定位

- **Issue:** #196
- **Status:** Research complete, ready for ADR
- **Author:** DSH (research support for 拓维 / 阿构)
- **Date:** 2026-11-18
- **Scope:** research only; no implementation, no ADR.

## 0. 一句话结论

**Obsidian 只借格式，不做同步层。**  
Markdown + YAML frontmatter + `[[wikilink]]` 是真相源；`local_kb/library/`
是本地资料库；SQLite FTS5 是索引。Obsidian 是 Owner 可选的编辑器，元婴不依赖
Obsidian Sync、iCloud 或任何插件。

## 1. Obsidian 的定位

| 方案 | 结论 | 理由 |
|---|---|---|
| **同步层**（Obsidian 作为 Markdown 真相源，元婴只读） | ❌ 不采用 | 会把文件真相绑定到 Obsidian 的同步/插件行为；iCloud/Dropbox 冲突、移动端编辑、插件改写都不可控。元婴需要“文件在本地、索引可重建”，不需要一个外部同步服务。 |
| **编辑器**（Owner 在 Obsidian 写，元婴消费） | ✅ 可选 | 只要 vault 是普通文件夹，Owner 可以用 Obsidian 打开；元婴只读扫描，不写回，不做双向同步。 |
| **格式借用**（Markdown + wikilink 约定，不依赖 Obsidian） | ✅ **推荐主方案** | 文件可被 Obsidian 打开，但元婴只依赖文件系统和 Markdown 约定；换编辑器/换机器不迁移。 |

**取舍：**
- 真相源 = 本地文件夹，不是 Obsidian 数据库。
- 元婴只做 **单向读取**：扫描 → 解析 → 索引；不监听 Obsidian 内部事件，不写回。
- 如果 Owner 希望“在 Obsidian 里编辑”，直接把 vault 指向
  `~/yuanying/local_kb/library/`（或其中一个子目录）；这是可选使用方式，不是系统依赖。
- `[[wikilink]]` 只作为**链接约定**保留；解析失败不阻塞索引，只在结果里标注
  `unresolved_link`。

## 2. 四类资料怎么归口

建议目录（不改变现有 `local_kb/docs/`、`raw/` 的职责）：

```
~/yuanying/local_kb/
  docs/                 # 现有：PM/PRD/私人长文（保持）
  raw/                  # 现有：导入的对话 Markdown（保持）
  library/
    projects/           # 项目资料的“策展副本”，不是 Git 真相源
    books/              # 藏书：source 文件 + 章节 Markdown
    web/                # 网页剪藏快照
    video/              # 视频笔记/字幕，不存视频文件
```

### 2.1 项目文件

| 问题 | 结论 |
|---|---|
| 真相源 | 代码与正式文档在 **Git repo**；私人/未公开 PRD 在 `local_kb/docs/`。`library/projects/` 只放“策展副本/索引卡”，不复制整棵 repo。 |
| 索引粒度 | 以文件 + 标题层级切 chunk（约 800 字，100 overlap）；Git 文件按 `path@commit` 记录版本。 |
| 全文 | 是；只索引 `local_kb` 的本地副本，不上传云端。 |
| 保留 | 项目生命周期 + Git 历史；删除项目时保留索引 tombstone 30 天，避免“搜到已删文件”。 |
| 边界 | 不在 `library/projects/` 里维护第二份代码；需要引用 repo 时存 `source_path`/`repo_url` 元数据。 |

### 2.2 藏书

| 问题 | 结论 |
|---|---|
| 真相源 | `library/books/<book-id>/source.epub|pdf` + 拆出的 `chapters/*.md`；原始文件本地保存。 |
| 索引粒度 | **章节级**，不按整本；章节标题/页码进 metadata，chunk 约 800 字。 |
| 全文 | 是；章节正文进 FTS5。 |
| 版权/体积 | 只处理 Owner 自购、公有领域或明确授权的内容；**不上传、不跨设备同步**。单本建议 ≤200MB；扫描版 PDF 不做 OCR（见排除项）。 |
| 保留 | 直到 Owner 删除；删除时同时删 source/chapters/index，保留 30 天回收站。 |

### 2.3 网页

| 问题 | 结论 |
|---|---|
| 真相源 | `library/web/<id>.md`：YAML frontmatter（url/title/fetched_at/content_hash）+ 正文快照；不是只存书签。 |
| 索引粒度 | 文首 + 段落 chunk；URL/域名/抓取时间进 metadata。 |
| 全文 | 是；正文快照是“当时的事实”，链接失效后仍可检索。 |
| 失效 | 每月检查一次 HTTP 状态；失效标记 `stale=true`，不自动删除。 |
| 保留 | 快照默认永久；Owner 可手动清理。版权内容只存摘要 + 链接，不存全文。 |

### 2.4 video

| 问题 | 结论 |
|---|---|
| 真相源 | **不存视频文件**；`library/video/<id>.md` 存 URL、标题、作者、笔记、可选字幕/transcript。 |
| 索引粒度 | 笔记 + 字幕段落；时间戳进 metadata（如 `00:12:30`）。 |
| 全文 | 只索引文字，不索引画面；不做视频理解。 |
| 保留 | 笔记永久；链接失效标记 `stale`；视频平台删除后笔记仍可读。 |

## 3. 检索预期

### 3.1 Owner 会怎么问（5 个真实问题）

1. “BWP 的定价之前是怎么定的？给我原始文档。”
2. “我 10 月收藏的那篇 FTS5 文章，结论是什么？”
3. “《Designing Data-Intensive Applications》第 4 章讲编码的部分，原文怎么说？”
4. “那个关于 token broker 的视频里提到的三个风险是什么？”
5. “我 Obsidian 里关于 Obsidian 同步冲突的笔记在哪？”

### 3.2 “答对 + 给出路径”的最低标准

每个答案必须同时满足：

- **有来源**：`source_type` + `path`（或 URL）+ `title`；
- **有定位**：章节/标题/时间戳/段落，不只给文件名；
- **有原文**：至少一段可核对 snippet；
- **不编造**：没有命中就明确说“资料库里没有找到”，并给出最接近的 2 条候选；
- **可行动**：Owner 能点开本地文件/链接复核。

返回形状（建议）：

```json
{
  "answer": "...",
  "citations": [
    {
      "source_type": "web|book|project|video|docs",
      "path": "library/web/2026-10-12-fts5.md",
      "url": "https://...",
      "title": "...",
      "locator": "section: 3.2 / page: 87 / 00:12:30",
      "snippet": "..."
    }
  ],
  "confidence": "high|medium|low",
  "not_found": false
}
```

## 4. 最小可行范围（MVP）

**一条端到端链路即可，不做功能清单：**

1. Owner 把 1 个 `.md` 网页剪藏、1 个 `.md` 书章、1 个视频笔记放进
   `local_kb/library/`（或通过 UI 导入）。
2. 本地服务扫描文件，解析 YAML frontmatter + 正文，写入
   `library` 元数据表 + FTS5（复用现有 SQLite 索引，不新建数据库）。
3. `search_local_kb` / 图书馆页返回命中：路径 + locator + snippet。
4. 元婴回答时带路径；没有命中就明确说没有。
5. 不依赖 Obsidian、不依赖云、不需要向量模型即可跑通；向量是后续增强。

**验收的“一条链路”：**

> 放入 `library/web/2026-10-12-fts5.md` → 问“FTS5 那篇的结论” → 返回
> `library/web/2026-10-12-fts5.md` + 小节 + 原文片段 → Owner 能打开文件复核。

## 5. 不做什么（本轮排除）

- ❌ Obsidian Sync / iCloud / Dropbox 作为真相源或同步层
- ❌ Obsidian 插件、双向同步、写回 vault
- ❌ 移动端采集 App（后续）
- ❌ PDF 扫描件 OCR / 视频转录 / 视频画面理解
- ❌ DRM 电子书破解、版权内容上传云端
- ❌ 自动全网爬虫、自动追更
- ❌ 多用户/共享图书馆权限系统（私人资料先本地单用户；#176 的 token 边界另议）
- ❌ 为“图书馆”新建独立数据库或独立服务；复用现有本地 SQLite + RAG 服务

## 6. 关键风险

| 风险 | 处理 |
|---|---|
| Obsidian vault 在 repo 外，路径穿越/符号链接 | 只允许配置的 `library_root`；拒绝 `..`、symlink 逃逸；只读扫描。 |
| 重复文件/重复内容 | `content_hash` 去重；同 URL 保留最新快照 + 历史版本。 |
| 索引过期 | 启动/定时扫描 + mtime；删除文件写 tombstone。 |
| 版权 | 只存 Owner 有权的内容；默认本机；不做云同步。 |
| 权限 | 图书馆数据只走本地服务；若未来远程访问，复用 #176 的 per-capability token，不暴露文件系统。 |
| 搜索结果过多/噪音 | 先 metadata filter（source_type/date/tag），再 FTS5 bm25；返回 top 5。 |

## 7. 给阿构的 ADR 输入

建议 ADR 只定四件事：

1. **Library root 与目录契约**：`local_kb/library/{projects,books,web,video}`；
   `library_root` 可配置，默认在 `local_kb` 下。
2. **元数据 schema**：`library_items`（id/source_type/path/url/title/hash/
   created_at/updated_at/stale/retention）+ `library_chunks`（item_id/locator/text）。
3. **检索 API 契约**：query + filters → citations（path/locator/snippet）。
4. **Obsidian 边界**：单向只读、格式兼容、不依赖 Sync/插件。

不把“UI 功能清单”写进 ADR；MVP 先用一条链路验收。

## 8. 结论

- **做**：格式借用、本地 library 目录、章节/网页/视频笔记索引、带路径引用。
- **不做**：Obsidian 同步层、插件、双向写回、视频文件/OCR。
- **待验证**：EPUB 解析质量、网页快照的正文提取、wikilink 解析。

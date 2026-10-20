# ES-033 — Legacy Data Ingestion (Stalio & Blinking Notes)

**Status**: Approved
**Category**: Feature (Data Migration)
**Tracking**: P2-17
**Refs**: ES-030 (Google Drive Tool), ES-002 (Notes), ES-031 (Backup)

## 1. 核心原则：必须保留溯源 (Provenance is Mandatory)

导入的数据绝不能和现在“手写”的数据混为一谈。元婴必须知道，哪些是原生记忆，
哪些是继承的旧档案。

所有导入的 notes 和 signals，在数据库的 `context` JSON 中必须包含：

```json
{
  "source": "import_stalio" | "import_blinking",
  "imported_at": "YYYY-MM-DD",
  "original_timestamp": "..."
}
```

## 2. 数据映射规则 (Data Mapping)

### 2.1 Stalio (习惯打卡)

- **格式**：预计为 CSV/JSON，包含日期、习惯名称、完成状态。
- **映射目标**：`signals` 表。
- **动作**：将历史习惯（如 water、walk、sleep）转化为历史 `signals` 记录。
  保留原始日期。
- **注意**：对于已经废弃的旧习惯（如 `sit`），直接作为历史信号写入，但绝不
  触发现在的提醒系统。
- **Source field**: use a provenance source value allowed by the current
  `signals` constraint (`import` is available; put
  `context.source='import_stalio'` plus the original timestamp).

### 2.2 Blinking Notes (笔记与对话)

- **格式**：长文本 / Markdown / JSON 导出。
- **映射目标**：`signals`（`name='note'`）和
  `core/memory/conversations/` 目录。
- **动作**：如果导出的是单条笔记，写入 notes；如果是长对话，格式化为之前
  设计的 standard record 写入本地 md 文件。
- **Source field**: `signals.source='import'` with
  `context.source='import_blinking'`.

## 3. 导入机制 (Ingestion Mechanism)

- **不要建新 UI**：不需要在 PWA 里画导入按钮。
- **使用脚本**：在 `scripts/` 下写一个 `npm run import:legacy` 的 Node.js
  脚本，由 Owner 在本地（或通过 GitHub Actions）手动执行。
- **分批处理**：写入时必须控制频率（例如每批 100 行 + 短延迟），避免瞬间
  撑爆数据库或触发 Supabase 限制。
- **Idempotency**: include an `import_key` (source + original id/timestamp) in
  `context`; re-running the script must skip rows that already exist.
- **Dry run**: support `--dry-run` to print counts without writing.

## 4. 元婴的感知 (AI Awareness)

更新 `core/system-manifest.md`：

> 你的数据库里包含 202X 年到现在的历史记忆（来自旧版工具）。你可以通过
> `get_notes` 和 `get_summary` 查询，也可以使用 `semantic_search`（如果已
> 实现）寻找旧观念。

## 5. Acceptance

- [ ] Stalio export maps to historical `signals` with provenance.
- [ ] Blinking notes map to notes and/or conversation records with provenance.
- [ ] Re-running the importer is idempotent.
- [ ] `--dry-run` works and writes nothing.
- [ ] Deprecated habits never trigger current reminders.

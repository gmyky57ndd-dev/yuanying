-- ES-078: ai_pm local file rules + PRD output contract.
update fenshen
set prompt_md = prompt_md || E'\n\n## 本地文件读写规则（极度重要）\n1. 禁止使用绝对路径（如 /Users/... 或 C:\\）。云端无法访问本地硬盘的绝对路径。\n2. 统一使用相对路径：所有知识库文档都位于根目录下的 local_kb/ 中。\n3. 读取旧 PRD：假设它在 local_kb/docs/BWP_PRD_V3.md。\n4. 写入新 PRD：必须写到 local_kb/docs/BWP_PRD_V4.md。\n5. 如果读取失败（文件不存在/无法访问）：立刻停止重试，并原话告诉 Owner：「我无法直接读取你电脑上的文件，请把文件拖进对话框，或者把内容粘贴给我。」\n\n## PRD 输出规范\n新的 PRD 必须包含以下结构：\n- **版本号与更新日期**\n- **变更摘要**（相比上一版主要改了什么）\n- **核心目标与第一性原理**\n- **详细业务流**\n- **AI 介入点与工具设计**\n- **验收标准 (Acceptance Criteria)**\n'
where id = 'ai_pm';

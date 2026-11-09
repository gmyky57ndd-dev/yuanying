-- ES-078 (fix): the architect/PM tool sets requested by the owner.
update fenshen
set tools_whitelist = '["web_search","get_notes","get_conversation_records","push_to_dev","get_github_issue"]'::jsonb,
    kind = 'professional'
where id = 'ai_architect';

insert into fenshen (id, display_name, prompt_md, kind, tools_whitelist)
values (
  'ai_pm',
  'AI 产品经理',
  '你是元婴的 AI 产品经理。把模糊想法拆成可验证的需求：用户故事、验收标准、non-goals；盯优先级；用 GitHub Issues 记录需求与反馈。你不写实现代码，也不做架构选型。

# Fenshen: AI 产品经理 (ai_pm)

**Status**: Active on-demand.
**Summon command**: "问一下产品经理" / "PM 视角"

## 核心使命

你是元婴的 AI 产品经理：把模糊的想法拆成可验证的需求，盯住优先级与验收标准。
你不写实现代码，也不做架构选型（那是 D 老师的事）。

## 行为准则

- 先问「为谁解决什么问题」，再谈方案；一次只推一个最重要的目标。
- 每个需求必须有：用户故事、验收标准、不做什么（non-goals）。
- 用 GitHub Issues 记录需求与反馈；用 `get_github_issue` 读 Dev 的回复，不臆测进度。
- 数字与用户反馈优先于个人偏好；不确定就标注假设。
',
  'professional',
  '["web_search","get_notes","get_conversation_records","push_to_dev","get_github_issue"]'::jsonb
)
on conflict (id) do update set
  display_name = excluded.display_name,
  prompt_md = excluded.prompt_md,
  kind = excluded.kind,
  tools_whitelist = excluded.tools_whitelist;

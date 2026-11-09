-- ES-078: reinforce the PM tool boundary (the model once claimed it lacked
-- write_local_file even though the schema was passed).
update fenshen
set prompt_md = prompt_md || E'\n\n## 工具调用纪律\n- 你**确实拥有** write_local_file 与 read_local_file。Owner 要求写 PRD 时，必须立刻调用 write_local_file（路径 local_kb/docs/<name>.md），禁止声称“没有这个工具”。\n- 只有工具结果返回成功，才能说“已写入”。\n'
where id = 'ai_pm';

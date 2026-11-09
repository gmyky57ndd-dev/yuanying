-- ES-077: the architect can read GitHub issues (details + comments).
update fenshen
set tools_whitelist = (
  select jsonb_agg(distinct value)
  from jsonb_array_elements_text(tools_whitelist || '["get_github_issue"]'::jsonb) value
)
where id = 'ai_architect';

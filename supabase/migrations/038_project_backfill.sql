-- ES-080: backfill existing data into the Yuanying project; expose project docs.
update messages set project_id = 'yuanying' where project_id is null;
update signals set project_id = 'yuanying' where project_id is null and name = 'note';

update fenshen
set tools_whitelist = (
  select jsonb_agg(distinct value)
  from jsonb_array_elements_text(tools_whitelist || '["read_project_doc"]'::jsonb) value
)
where id in ('ai_pm', 'ai_architect');

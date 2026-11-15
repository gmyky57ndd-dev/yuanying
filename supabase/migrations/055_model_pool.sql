-- #174 AC-1: provider coverage; AC-B: default per-fenshen model.
insert into models (id, provider, model_name, base_url)
values
  ('deepseek-reasoner', 'deepseek', 'deepseek-reasoner', 'https://api.deepseek.com/v1'),
  ('openrouter-gpt-4o-mini', 'openrouter', 'openai/gpt-4o-mini', 'https://openrouter.ai/api/v1'),
  ('anthropic-claude-sonnet-4', 'anthropic', 'claude-sonnet-4-20250514', null),
  ('openai-gpt-4o-mini', 'openai', 'gpt-4o-mini', null)
on conflict (id) do nothing;

update fenshen
set model_name = coalesce(model_name, 'deepseek-chat'),
    primary_model = coalesce(primary_model, 'deepseek-chat')
where model_name is null or primary_model is null;

create index if not exists cost_ledger_fenshen_created_idx
  on cost_ledger(fenshen_id, created_at desc);

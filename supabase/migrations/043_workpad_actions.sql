-- ES-081: Workpad actions ledger + onboarding status tools.
create table if not exists workpad_actions (
  id bigserial primary key,
  project_id text not null references projects(id) on delete cascade,
  description text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','done','failed','cancelled')),
  result_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_workpad_actions_project_status
  on workpad_actions (project_id, status);

update fenshen
set tools_whitelist = (
  select jsonb_agg(distinct value)
  from jsonb_array_elements_text(
    tools_whitelist || '["plan_actions","complete_action","get_project_status"]'::jsonb
  ) value
)
where id in ('ai_pm', 'ai_architect');

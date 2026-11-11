-- ES-080 desktop MVP: simple, manually maintained goals (AI reads, never infers).
create table if not exists goals (
  id bigserial primary key,
  project_id text references projects(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  due_date date,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_goals_project_status on goals (project_id, status);

update fenshen
set tools_whitelist = (
  select jsonb_agg(distinct value)
  from jsonb_array_elements_text(tools_whitelist || '["get_goals"]'::jsonb) value
)
where id in ('ai_pm', 'ai_architect');

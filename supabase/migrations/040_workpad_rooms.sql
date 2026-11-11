-- ES-080 (desktop): Workpad rooms — participating fenshen + per-fenshen model.
-- DEVIATION: the blueprint says `fenshen_templates.model_name`; the existing
-- `fenshen` table IS the template table, so the column is added there.
create table if not exists project_fenshen_map (
  project_id text not null references projects(id) on delete cascade,
  fenshen_id text not null references fenshen(id) on delete cascade,
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (project_id, fenshen_id)
);

alter table fenshen add column if not exists model_name text;
alter table messages add column if not exists responder_fenshen_id text;

insert into project_fenshen_map (project_id, fenshen_id, is_lead)
values
  ('yuanying', 'xiaowu', true),
  ('bwp', 'ai_pm', true),
  ('bwp', 'ai_architect', false),
  ('aso', 'ai_pm', true)
on conflict (project_id, fenshen_id) do nothing;

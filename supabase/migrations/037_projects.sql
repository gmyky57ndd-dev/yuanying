-- ES-080: Project → Role → Workpad → Artifact.
create table if not exists projects (
  id text primary key,
  name text not null unique,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

insert into projects (id, name, description)
values
  ('yuanying', 'Yuanying', '元婴本体：PWA、采集器、记忆与分身'),
  ('bwp', 'BWP', 'Business Workpad：多角色项目协作工作台'),
  ('aso', 'ASO', 'App Store 优化项目')
on conflict (id) do nothing;

alter table messages add column if not exists project_id text;
alter table signals add column if not exists project_id text;

create table if not exists project_docs (
  id bigserial primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists idx_messages_project on messages (project_id, id);
create index if not exists idx_signals_project on signals (project_id, created_at);

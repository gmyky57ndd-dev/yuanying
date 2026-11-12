-- Phase 1: playbook enablement + owner approval gate.
alter table fenshen add column if not exists enabled boolean not null default true;

create table if not exists approvals (
  id bigserial primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  description text,
  adr text,
  status text not null default 'proposed'
    check (status in ('proposed','adr_ready','approved','rejected','implementing','done')),
  created_by text,
  approved_by text,
  issue_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists idx_approvals_project_status
  on approvals (project_id, status, updated_at desc);

update fenshen set enabled = true where enabled is null;

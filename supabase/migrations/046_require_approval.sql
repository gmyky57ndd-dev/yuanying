-- Phase 3: hard approval gate per project.
alter table projects add column if not exists require_approval boolean not null default false;

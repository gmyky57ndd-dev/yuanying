-- ADR-006: primary/backup model failover.
alter table fenshen add column if not exists primary_model text;
alter table fenshen add column if not exists backup_model text;
update fenshen set primary_model = model_name where primary_model is null;

alter table cost_ledger add column if not exists degraded boolean not null default false;
alter table cost_ledger add column if not exists fallback_reason text;

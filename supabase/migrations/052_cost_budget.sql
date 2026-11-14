-- ADR-004: dynamic routing + cost ledger + budget circuit breaker.
alter table projects add column if not exists token_budget bigint not null default 0;
alter table projects add column if not exists cost_budget numeric(12,4) not null default 0;

create table if not exists model_prices (
  model_id text primary key,
  input_per_1m numeric(12,4) not null default 0,
  output_per_1m numeric(12,4) not null default 0,
  currency text not null default 'USD'
);

insert into model_prices (model_id, input_per_1m, output_per_1m, currency)
values ('deepseek-chat', 0.27, 1.10, 'USD')
on conflict (model_id) do nothing;

create table if not exists cost_ledger (
  id bigserial primary key,
  project_id text not null,
  fenshen_id text,
  model_id text not null,
  request_id text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  estimated_cost numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cost_ledger_project_created_idx on cost_ledger(project_id, created_at desc);

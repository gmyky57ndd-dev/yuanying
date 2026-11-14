-- v0.02d: production deploy requires an owner UI confirmation token.
create table if not exists deploy_confirmations (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  version text not null,
  plan text not null,
  phrase text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  result text
);
create index if not exists deploy_confirmations_status_idx on deploy_confirmations(status, expires_at);

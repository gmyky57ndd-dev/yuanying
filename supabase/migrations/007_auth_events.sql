-- ES-004 §3.1: auth_events (logging phase; no raw IP stored)
create table if not exists auth_events (
  id         bigserial primary key,
  ts         timestamptz not null default now(),
  route      text not null,
  ip_hash    text,
  would_401  boolean not null,
  enforced   boolean not null default false
);

create index if not exists idx_auth_events_ts on auth_events (ts desc);
create index if not exists idx_auth_events_would on auth_events (would_401, ts desc);

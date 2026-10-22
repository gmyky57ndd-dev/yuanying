-- ES-061: minimal server-side event log so 元婴 can answer "what just failed?"
-- without reading Vercel logs. Keep only operational metadata, never message text.
create table if not exists system_events (
  id bigserial primary key,
  ts timestamptz not null default now(),
  route text not null,
  status int not null,
  duration_ms int,
  error text,
  meta jsonb
);

create index if not exists idx_system_events_ts on system_events (ts desc);
create index if not exists idx_system_events_status on system_events (status, ts desc);

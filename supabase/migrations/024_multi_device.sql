-- ES-063: multi-device presence + per-message device id for realtime dedupe.
create table if not exists device_presence (
  device_id text primary key,
  device text,
  status text not null default 'active',
  last_seen timestamptz not null default now()
);
create index if not exists idx_device_presence_last_seen
  on device_presence (last_seen desc);

alter table messages add column if not exists device_id text;
create index if not exists idx_messages_device on messages (device_id);

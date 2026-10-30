-- ES-075 module B: every local reminder delivery (or failure) is recorded.
create table if not exists reminder_deliveries (
  id bigserial primary key,
  habit text not null,
  scheduled_at timestamptz not null,
  fired_at timestamptz,
  status text not null check (status in ('delivered', 'failed')),
  error_message text,
  device_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_reminder_deliveries_scheduled
  on reminder_deliveries (scheduled_at desc);
create index if not exists idx_reminder_deliveries_habit
  on reminder_deliveries (habit, scheduled_at desc);

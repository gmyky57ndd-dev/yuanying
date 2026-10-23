-- ES-065: Web Push subscriptions (one row per browser/PWA install).
create table if not exists push_subscriptions (
  id bigserial primary key,
  device_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists idx_push_subscriptions_device
  on push_subscriptions (device_id);

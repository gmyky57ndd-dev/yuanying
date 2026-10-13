-- =============================================
-- 元婴 v1 数据 Schema (idempotent; safe on existing DB)
-- 执行方式：Supabase SQL Editor 粘贴执行
-- =============================================

create extension if not exists "pgcrypto";

-- =============================================
-- 表 1：messages
-- =============================================
create table if not exists messages (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  session_id  uuid,
  metadata    jsonb default '{}'::jsonb
);

-- upgrade pre-v1 messages tables
alter table messages add column if not exists session_id uuid;
alter table messages add column if not exists metadata jsonb default '{}'::jsonb;

create index if not exists idx_messages_created_at on messages (created_at desc);
create index if not exists idx_messages_session on messages (session_id, created_at asc);

-- =============================================
-- 表 2：signals
-- =============================================
create table if not exists signals (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  type        text not null default 'event',
  value       jsonb,
  note        text,
  source      text not null default 'manual',
  context     jsonb default '{}'::jsonb
);

-- upgrade pre-v1 signals tables
alter table signals add column if not exists type text not null default 'event';
alter table signals add column if not exists source text not null default 'manual';
alter table signals add column if not exists context jsonb default '{}'::jsonb;

-- type / source constraints
do $$ begin
  begin
    alter table signals add constraint signals_type_check
      check (type in ('event', 'count', 'duration', 'state', 'note'));
  exception when duplicate_object then null; end;
  begin
    alter table signals add constraint signals_source_check
      check (source in ('manual', 'usagestats', 'activitywatch', 'passive', 'inferred'));
  exception when duplicate_object then null; end;
end $$;

-- name constraint: v1 four signals + P2 reserved names
alter table signals drop constraint if exists signals_name_check;
alter table signals drop constraint if exists v1_signal_name;
alter table signals add constraint v1_signal_name check (
  name in ('wake', 'sleep', 'water', 'sit', 'app_usage', 'phone_unlock')
);

create index if not exists idx_signals_created_at on signals (created_at desc);
create index if not exists idx_signals_name_created on signals (name, created_at desc);
create index if not exists idx_signals_source on signals (source, created_at desc);

-- =============================================
-- 表 3：habits（v1 预留，不启用）
-- =============================================
create table if not exists habits (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  name            text not null unique,
  type            text not null,
  target          jsonb,
  capture_config  jsonb,
  active          boolean not null default true
);

-- =============================================
-- 表 4：config（键值配置）
-- =============================================
create table if not exists config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into config (key, value) values
  ('activity_collection_enabled', 'true'::jsonb),
  ('timezone', '"Asia/Shanghai"'::jsonb)
on conflict (key) do nothing;

-- =============================================
-- 表 5：activity_logs（P2 采集器上报的原始批次）
-- =============================================
create table if not exists activity_logs (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  platform        text not null check (platform in ('android', 'ios', 'desktop')),
  window_start    timestamptz not null,
  window_end      timestamptz not null,
  raw_payload     jsonb not null,
  processed       boolean not null default false
);

create index if not exists idx_activity_logs_window on activity_logs (window_start desc);
create index if not exists idx_activity_logs_unprocessed
  on activity_logs (processed, created_at desc)
  where processed = false;

-- =============================================
-- 视图：今日信号汇总
-- =============================================
create or replace view v_today_signals as
select
  name,
  count(*) as count,
  min(created_at) as first_at,
  max(created_at) as last_at
from signals
where created_at >= current_date
group by name;

-- =============================================
-- 函数：获取今日汇总（供 /api/summary 调用）
-- =============================================
create or replace function get_today_summary()
returns jsonb as $$
declare
  result jsonb;
begin
  select jsonb_object_agg(name, jsonb_build_object(
    'count', count,
    'first_at', first_at,
    'last_at', last_at
  ))
  into result
  from v_today_signals;

  return coalesce(result, '{}'::jsonb);
end;
$$ language plpgsql;

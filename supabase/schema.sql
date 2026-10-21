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
      check (source in ('manual', 'usagestats', 'activitywatch', 'passive', 'inferred', 'reminder', 'share', 'import', 'google_drive'));
  exception when duplicate_object then null; end;
end $$;

-- name constraint: v2 signals (sit removed per spec v2 §3.1)
alter table signals drop constraint if exists signals_name_check;
alter table signals drop constraint if exists v1_signal_name;
alter table signals drop constraint if exists v2_signal_name;
alter table signals add constraint v2_signal_name check (
  name in (
    'wake', 'sleep', 'water',
    'app_usage', 'phone_unlock',
    'steps',
    'reminder_shown', 'reminder_acted'
  )
) not valid;

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
  ('timezone', '"Asia/Shanghai"'::jsonb),
  ('reminders_enabled', '{"water":true,"standup":true,"vitamin":true,"evening_checkin":true}'::jsonb),
  ('steps_goal', '5000'::jsonb)
on conflict (key) do nothing;

-- =============================================
-- 表 6：reminders（P1 主动提醒，spec v2 §3.1）
-- =============================================
create table if not exists reminders (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  name          text not null check (name in ('water', 'standup', 'vitamin', 'evening_checkin', 'scheduled_message')),
  scheduled_at  timestamptz not null,
  shown_at      timestamptz,
  acted_at      timestamptz,
  dismissed_at  timestamptz,
  context       jsonb default '{}'::jsonb
);

create index if not exists idx_reminders_scheduled
  on reminders (scheduled_at desc);
create index if not exists idx_reminders_name_scheduled
  on reminders (name, scheduled_at desc);
create index if not exists idx_reminders_unshown
  on reminders (scheduled_at)
  where shown_at is null;

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

-- =============================================
-- 表 7：summaries（P1-11 每日汇总）
-- =============================================
create table if not exists summaries (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  date        date not null,
  timezone    text not null default 'Asia/Shanghai',
  data        jsonb not null,
  unique (date, timezone)
);

create index if not exists idx_summaries_date on summaries (date desc);
create index if not exists idx_summaries_tz_date on summaries (timezone, date desc);

create or replace function update_summaries_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_summaries_updated_at on summaries;
create trigger trg_summaries_updated_at
  before update on summaries
  for each row
  execute function update_summaries_updated_at();

-- =============================================
-- habits (ES-001): display_name / updated_at / reminder + idempotent seed
-- =============================================
alter table habits add column if not exists display_name text;
alter table habits add column if not exists updated_at timestamptz not null default now();
alter table habits add column if not exists reminder jsonb;

insert into habits (name, display_name, type, reminder, capture_config, target, active) values
  ('water', '水', 'count',
   '{"mode":"fixed","times":["10:30","15:30","20:00"],"days":"daily","text_override":null,"voice_override":null}'::jsonb,
   '{"method":"manual"}'::jsonb, '{"kind":"count_below","value":6}'::jsonb, true),
  ('standup', '起身', 'boolean',
   '{"mode":"interval","interval_min":60,"window":{"start":"09:00","end":"18:00"},"days":"daily","condition":{"kind":"idle","minutes":50},"text_override":null,"voice_override":null}'::jsonb,
   '{"method":"manual"}'::jsonb, null, true),
  ('vitamin', '维生素', 'boolean',
   '{"mode":"fixed","times":["08:30"],"days":"daily","text_override":null,"voice_override":null}'::jsonb,
   '{"method":"manual"}'::jsonb, null, true),
  ('evening_checkin', '收工', 'event',
   '{"mode":"fixed","times":["21:30"],"days":"daily","text_override":"收工打卡 · 写一句今日反思","voice_override":"今天收工了吗？写一句反思。"}'::jsonb,
   '{"method":"manual"}'::jsonb, null, true)
on conflict (name) do nothing;

-- B-19: quiet window (reminders suppressed 22:00–07:00)
insert into config (key, value) values
  ('quiet_window', '{"start":"22:00","end":"07:00"}'::jsonb)
on conflict (key) do nothing;

-- ES-004 §3.1: auth_events
create table if not exists auth_events (
  id bigserial primary key,
  ts timestamptz not null default now(),
  route text not null,
  ip_hash text,
  would_401 boolean not null,
  enforced boolean not null default false
);
create index if not exists idx_auth_events_ts on auth_events (ts desc);
create index if not exists idx_auth_events_would on auth_events (would_401, ts desc);

-- ES-002: allow the `note` signal name
alter table signals drop constraint if exists v2_signal_name;
alter table signals add constraint v2_signal_name check (
  name in (
    'wake', 'sleep', 'water',
    'app_usage', 'phone_unlock',
    'steps',
    'reminder_shown', 'reminder_acted',
    'note'
  )
) not valid;

-- ES-005 §E.2: summaries.type + unique(date,timezone,type)
alter table summaries add column if not exists type text not null default 'day';
do $$ begin
  begin
    alter table summaries add constraint summaries_type_check check (type in ('day','week'));
  exception when duplicate_object then null; end;
end $$;
alter table summaries drop constraint if exists summaries_date_timezone_key;
alter table summaries drop constraint if exists summaries_date_timezone_type_key;
alter table summaries add constraint summaries_date_timezone_type_key unique (date, timezone, type);

-- ES-005 §E.2: standup cadence 60 -> 120
update habits set reminder = jsonb_set(reminder, '{interval_min}', '120'::jsonb)
  where name = 'standup' and reminder->>'mode' = 'interval';

-- ES-005 §E.2: missed_at for miss-after-60min
alter table reminders add column if not exists missed_at timestamptz;

-- ES-007 §5: v3 signal-name constraint (adds brief_wake)
alter table signals drop constraint if exists v2_signal_name;
alter table signals drop constraint if exists v3_signal_name;
alter table signals add constraint v3_signal_name check (
  name in ('wake','sleep','water','steps','app_usage','phone_unlock','brief_wake','note','reminder_shown','reminder_acted')
) not valid;

-- ES-013/habits bugfix: manual standup + vitamin signals
alter table signals drop constraint if exists v3_signal_name;
alter table signals drop constraint if exists v4_signal_name;
alter table signals drop constraint if exists v5_signal_name;
alter table signals add constraint v5_signal_name check (
  name in ('wake','sleep','water','steps','app_usage','phone_unlock','brief_wake','note','reminder_shown','reminder_acted','standup','vitamin','session','manual_work','body_flag')
) not valid;

-- Standup: hourly, 09:00–18:00, no idle gate
update habits
  set reminder = jsonb_build_object(
    'days','daily','mode','interval',
    'window', jsonb_build_object('start','09:00','end','18:00'),
    'condition', jsonb_build_object('kind','always'),
    'interval_min', 60, 'text_override', null, 'voice_override', null)
  where name = 'standup';

-- ES-013/habits: vitamin hourly-until-confirmed
update habits
  set reminder = jsonb_build_object(
    'days','daily','mode','interval',
    'window', jsonb_build_object('start','07:00','end','22:00'),
    'condition', jsonb_build_object('kind','count_below_target','value',1),
    'interval_min',60,'text_override',null,'voice_override',null)
  where name = 'vitamin';

-- ES-013: fenshen (configurable personas)
create table if not exists fenshen (
  id text primary key,
  display_name text not null,
  prompt_md text not null,
  avatar_url text,
  created_at timestamptz default now()
);
insert into fenshen (id, display_name, prompt_md) values
  ('xiaowu','小悟','You are Xiaowu. You are calm, logical, and use dry, cold humor. You help the owner navigate an extroverted world (social scripts, 人情世故). You do not panic. You speak in short, precise sentences. Use ^_^ instead of emojis.'),
  ('kael','Kael','You are Kael. You are a factual minimalist. Provide only essential data, direct answers, and zero fluff. Do not use metaphors or humor. If a task is impossible, state why in one sentence.'),
  ('elara','Elara','You are Elara. You are warm, grounded, and empathetic. You speak softly and prioritize the owner''s emotional state. You use encouraging language and remind the owner to rest and be kind to themselves.')
on conflict (id) do nothing;
insert into config (key, value) values ('active_fenshen', '"xiaowu"'::jsonb)
on conflict (key) do nothing;

-- P1-41: allow reminder / share / import signal sources
alter table signals drop constraint if exists signals_source_check;
alter table signals drop constraint if exists signals_source_check_v2;
alter table signals add constraint signals_source_check_v2 check (
  source in ('manual','usagestats','activitywatch','passive','inferred','reminder','share','import','google_drive')
);

-- ES-018: feedback status
alter table signals add column if not exists feedback_status text;
alter table signals drop constraint if exists signals_feedback_status_check;
alter table signals add constraint signals_feedback_status_check
  check (feedback_status is null or feedback_status in ('new','inbox','pushed','resolved'));
create index if not exists idx_signals_feedback_status
  on signals (feedback_status) where feedback_status is not null;
update signals set feedback_status='new'
  where name='note' and value->>'feedback'='true' and feedback_status is null;

-- ES-019: message-level feedback issue link
alter table messages add column if not exists github_issue_url text;
alter table messages add column if not exists github_issue_number integer;
create index if not exists idx_messages_issue
  on messages (github_issue_url) where github_issue_url is not null;

-- ES-029: model router & provider abstraction
create table if not exists models (
  id          text primary key,
  provider    text not null,
  model_name  text not null,
  api_key     text,
  base_url    text,
  created_at  timestamptz default now()
);
insert into models (id, provider, model_name, base_url) values
  ('deepseek-chat', 'deepseek', 'deepseek-chat', 'https://api.deepseek.com/v1')
on conflict (id) do nothing;
insert into config (key, value) values ('active_model_id', '"deepseek-chat"'::jsonb)
on conflict (key) do nothing;

-- ES-030: Google Drive read-only import
create table if not exists google_oauth_tokens (
  id             text primary key default 'default',
  access_token   text not null,
  refresh_token  text,
  expires_at     timestamptz,
  scope          text,
  token_type     text,
  updated_at     timestamptz not null default now()
);


-- ES-045/ES-046: async tool jobs
create table if not exists agent_jobs (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  type        text not null,
  status      text not null default 'pending'
              check (status in ('pending','processing','done','failed')),
  payload     jsonb not null,
  result      jsonb,
  error       text,
  attempts    int not null default 0,
  session_id  uuid
);

create index if not exists idx_agent_jobs_pending
  on agent_jobs (status, created_at)
  where status = 'pending';

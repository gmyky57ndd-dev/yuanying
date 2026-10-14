-- =============================================
-- 元婴 v2 Schema 迁移 (spec v2 §3.1)
-- v1 -> v2: remove sit, add steps/reminder names, reminders table, config defaults
-- =============================================

-- 1. 移除 v1 / 中间态约束
alter table signals drop constraint if exists v1_signal_name;
alter table signals drop constraint if exists v2_signal_name;
alter table signals drop constraint if exists signals_name_check;

-- 2. v2 信号约束（不含 sit）
-- NOT VALID: historical `sit` rows are retained as audit trail (AGENTS.md §3.5);
-- the constraint still enforces new inserts/updates.
alter table signals add constraint v2_signal_name check (
  name in (
    'wake', 'sleep', 'water',
    'app_usage', 'phone_unlock',
    'steps',
    'reminder_shown', 'reminder_acted'
  )
) not valid;

-- 3. reminders 表
create table if not exists reminders (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  name          text not null check (name in ('water', 'standup', 'vitamin')),
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

-- 4. config 默认值
insert into config (key, value) values
  ('reminders_enabled', '{"water":true,"standup":true,"vitamin":true}'::jsonb),
  ('steps_goal', '5000'::jsonb)
on conflict (key) do nothing;

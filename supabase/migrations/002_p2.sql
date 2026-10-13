-- =============================================
-- 元婴 v1 P2 迁移（Day 4）：扩展 signals + activity_logs 索引
-- 若已执行最新 schema.sql，本文件为幂等补充，可安全重复执行。
-- =============================================

alter table signals drop constraint if exists v1_signal_name;
alter table signals drop constraint if exists v2_signal_name;
alter table signals add constraint v2_signal_name check (
  name in ('wake', 'sleep', 'water', 'sit', 'app_usage', 'phone_unlock')
);

create index if not exists idx_activity_logs_unprocessed
  on activity_logs (processed, created_at desc)
  where processed = false;

-- ES-013 / habits bugfix (2026-10-16)
-- 1) Manual tracking for standup + vitamin (home tracking list).
alter table signals drop constraint if exists v3_signal_name;
alter table signals drop constraint if exists v4_signal_name;
alter table signals add constraint v4_signal_name check (
  name in (
    'wake', 'sleep', 'water', 'steps', 'app_usage', 'phone_unlock',
    'brief_wake', 'note', 'reminder_shown', 'reminder_acted',
    'standup', 'vitamin', 'session'
  )
) not valid;

-- 2) Standup: hourly (60 min), window 09:00–18:00, no idle gate.
--    (Owner expects a stand-up reminder every hour.)
update habits
  set reminder = jsonb_build_object(
    'days', 'daily',
    'mode', 'interval',
    'window', jsonb_build_object('start', '09:00', 'end', '18:00'),
    'condition', jsonb_build_object('kind', 'always'),
    'interval_min', 60,
    'text_override', null,
    'voice_override', null
  )
  where name = 'standup';

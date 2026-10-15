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

-- ES-007 §2/§5: v3 signal-name constraint (adds brief_wake)
alter table signals drop constraint if exists v2_signal_name;
alter table signals drop constraint if exists v3_signal_name;
alter table signals add constraint v3_signal_name check (
  name in (
    'wake', 'sleep', 'water', 'steps', 'app_usage', 'phone_unlock',
    'brief_wake', 'note', 'reminder_shown', 'reminder_acted'
  )
) not valid;

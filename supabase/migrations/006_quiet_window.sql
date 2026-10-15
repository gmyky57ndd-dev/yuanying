-- B-19: quiet window (reminders suppressed 22:00–07:00 in config.timezone; no backfill)
insert into config (key, value) values
  ('quiet_window', '{"start":"22:00","end":"07:00"}'::jsonb)
on conflict (key) do nothing;

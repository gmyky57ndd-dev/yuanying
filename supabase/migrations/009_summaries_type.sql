-- ES-005 §E.2: summaries.type + unique(date,timezone,type); standup cadence -> 120
alter table summaries add column if not exists type text not null default 'day';

do $$ begin
  begin
    alter table summaries add constraint summaries_type_check
      check (type in ('day', 'week'));
  exception when duplicate_object then null; end;
end $$;

alter table summaries drop constraint if exists summaries_date_timezone_key;
alter table summaries drop constraint if exists summaries_date_timezone_type_key;
alter table summaries add constraint summaries_date_timezone_type_key
  unique (date, timezone, type);

-- Standup cadence: 60 -> 120 minutes (ES-005 §E.2)
update habits
  set reminder = jsonb_set(reminder, '{interval_min}', '120'::jsonb)
  where name = 'standup' and reminder->>'mode' = 'interval';

-- ES-005 §E.2: missed_at for miss-after-60min
alter table reminders add column if not exists missed_at timestamptz;

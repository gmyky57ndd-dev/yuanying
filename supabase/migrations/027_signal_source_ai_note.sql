-- ES-071: allow AI-authored notes to be distinguished from manual ones.
alter table signals drop constraint if exists signals_source_check;
alter table signals drop constraint if exists signals_source_check_v2;
alter table signals add constraint signals_source_check_v2 check (
  source in (
    'manual','usagestats','activitywatch','passive','inferred','reminder',
    'share','import','google_drive','yuanying_summary'
  )
);

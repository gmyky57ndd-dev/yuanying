-- P1-41: allow reminder-originated habit signals (and session share/import).
-- The old source check rejected 'reminder', so notification actions silently
-- failed to write water/standup/vitamin signals.
alter table signals drop constraint if exists signals_source_check;
alter table signals drop constraint if exists signals_source_check_v2;
alter table signals add constraint signals_source_check_v2 check (
  source in (
    'manual', 'usagestats', 'activitywatch', 'passive', 'inferred',
    'reminder', 'share', 'import'
  )
);

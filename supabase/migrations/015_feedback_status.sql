-- ES-018 §2 — feedback status on notes (Option B: dedicated column).
alter table signals add column if not exists feedback_status text;

alter table signals drop constraint if exists signals_feedback_status_check;
alter table signals add constraint signals_feedback_status_check
  check (
    feedback_status is null
    or feedback_status in ('new', 'inbox', 'pushed', 'resolved')
  );

create index if not exists idx_signals_feedback_status
  on signals (feedback_status)
  where feedback_status is not null;

-- Backfill existing feedback notes.
update signals
  set feedback_status = 'new'
  where name = 'note'
    and value->>'feedback' = 'true'
    and feedback_status is null;

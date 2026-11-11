-- Issue #95: feedback state machine closes when the GitHub issue closes.
alter table signals add column if not exists resolved_at timestamptz;

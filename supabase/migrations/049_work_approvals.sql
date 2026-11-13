-- #134: approval state machine is the source of truth; link the issue.
alter table approvals rename to work_approvals;
alter table work_approvals add column if not exists issue_number integer;

-- ES-085 / #130: pending/in_progress actions must have a GitHub issue.
alter table workpad_actions drop constraint if exists workpad_action_issue_required;
alter table workpad_actions add constraint workpad_action_issue_required
  check (status not in ('pending','in_progress') or github_issue_number is not null) not valid;
alter table workpad_actions validate constraint workpad_action_issue_required;

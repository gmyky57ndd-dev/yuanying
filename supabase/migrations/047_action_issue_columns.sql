-- ES-085 / #130: anchor every action to a GitHub issue.
alter table workpad_actions add column if not exists github_issue_number integer;
alter table workpad_actions add column if not exists github_issue_url text;

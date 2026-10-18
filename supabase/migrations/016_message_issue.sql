-- ES-019 — message-level feedback: store the GitHub issue on the chat message.
alter table messages add column if not exists github_issue_url text;
alter table messages add column if not exists github_issue_number integer;

create index if not exists idx_messages_issue
  on messages (github_issue_url)
  where github_issue_url is not null;

-- ES-045/ES-046: async tool jobs + scheduler reminders.

create table if not exists agent_jobs (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  type        text not null,
  status      text not null default 'pending'
              check (status in ('pending','processing','done','failed')),
  payload     jsonb not null,
  result      jsonb,
  error       text,
  attempts    int not null default 0,
  session_id  uuid
);

create index if not exists idx_agent_jobs_pending
  on agent_jobs (status, created_at)
  where status = 'pending';

alter table reminders drop constraint if exists reminders_name_check;
alter table reminders add constraint reminders_name_check check (
  name in ('water','standup','vitamin','evening_checkin','scheduled_message')
);

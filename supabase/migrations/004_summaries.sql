-- =============================================
-- 元婴 summaries 表 (Appendix A / P1-11)
-- =============================================

create table if not exists summaries (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  date        date not null,
  timezone    text not null default 'Asia/Shanghai',
  data        jsonb not null,
  unique (date, timezone)
);

create index if not exists idx_summaries_date
  on summaries (date desc);
create index if not exists idx_summaries_tz_date
  on summaries (timezone, date desc);

create or replace function update_summaries_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_summaries_updated_at on summaries;
create trigger trg_summaries_updated_at
  before update on summaries
  for each row
  execute function update_summaries_updated_at();

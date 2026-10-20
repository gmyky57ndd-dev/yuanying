-- ES-030 — Google Drive read-only import
-- Notes are stored in `signals` with name='note'; this adds the provenance
-- source and a server-side token store.

alter table signals drop constraint if exists signals_source_check;
alter table signals drop constraint if exists signals_source_check_v2;
alter table signals add constraint signals_source_check_v2 check (
  source in (
    'manual', 'usagestats', 'activitywatch', 'passive', 'inferred',
    'reminder', 'share', 'import', 'google_drive'
  )
);

create table if not exists google_oauth_tokens (
  id             text primary key default 'default',
  access_token   text not null,
  refresh_token  text,
  expires_at     timestamptz,
  scope          text,
  token_type     text,
  updated_at     timestamptz not null default now()
);

-- ES-053: external AI conversation import + full-text search.
create table if not exists external_chats (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  source      text not null,
  content     text not null,
  search      tsvector generated always as (to_tsvector('simple', content)) stored
);

create index if not exists idx_external_chats_search
  on external_chats using gin(search);
create index if not exists idx_external_chats_created
  on external_chats (created_at desc);

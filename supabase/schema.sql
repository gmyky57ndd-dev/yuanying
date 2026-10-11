-- 元婴 prototype schema
-- Run in the Supabase SQL editor.

create table messages (
  id bigserial primary key,
  created_at timestamptz default now(),
  role text not null check (role in ('user','assistant')),
  content text not null
);

create table signals (
  id bigserial primary key,
  created_at timestamptz default now(),
  name text not null check (name in ('wake','sleep','water','sit')),
  value jsonb,
  note text
);

create index on messages (created_at desc);
create index on signals (created_at desc);

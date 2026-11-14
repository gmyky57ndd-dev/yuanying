-- ES-087 / approval #5: idle GitHub polling state per fenshen.
create table if not exists fenshen_poll_state (
  fenshen_id text primary key,
  last_full_at timestamptz,
  last_light_at timestamptz,
  seen jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

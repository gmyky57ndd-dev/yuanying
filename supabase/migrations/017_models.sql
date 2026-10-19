-- ES-029 — Model router & provider abstraction
-- Model credentials stay server-side; the API never returns api_key.

create table if not exists models (
  id          text primary key,
  provider    text not null,
  model_name  text not null,
  api_key     text,
  base_url    text,
  created_at  timestamptz default now()
);

insert into models (id, provider, model_name, base_url) values
  ('deepseek-chat', 'deepseek', 'deepseek-chat', 'https://api.deepseek.com/v1')
on conflict (id) do nothing;

insert into config (key, value)
values ('active_model_id', '"deepseek-chat"'::jsonb)
on conflict (key) do nothing;

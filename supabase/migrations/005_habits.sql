-- =============================================
-- 元婴 habits (ES-001) — extend table + idempotent seed
-- v1: passive new habits only; read-only admin; no new public write endpoints.
-- =============================================

alter table habits add column if not exists display_name text;
alter table habits add column if not exists updated_at timestamptz not null default now();
alter table habits add column if not exists reminder jsonb;

-- Idempotent seed: preserves owner-modified settings on redeploy.
insert into habits (name, display_name, type, reminder, capture_config, target, active) values
  ('water', '水', 'count',
   '{"mode":"fixed","times":["10:30","15:30","20:00"],"days":"daily","text_override":null,"voice_override":null}'::jsonb,
   '{"method":"manual"}'::jsonb,
   '{"kind":"count_below","value":6}'::jsonb,
   true),
  ('standup', '起身', 'boolean',
   '{"mode":"interval","interval_min":60,"window":{"start":"09:00","end":"18:00"},"days":"daily","condition":{"kind":"idle","minutes":50},"text_override":null,"voice_override":null}'::jsonb,
   '{"method":"manual"}'::jsonb,
   null,
   true),
  ('vitamin', '维生素', 'boolean',
   '{"mode":"fixed","times":["08:30"],"days":"daily","text_override":null,"voice_override":null}'::jsonb,
   '{"method":"manual"}'::jsonb,
   null,
   true)
on conflict (name) do nothing;

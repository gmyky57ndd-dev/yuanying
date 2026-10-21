-- ES-051: config-driven tool readback (default silent).
insert into config (key, value)
values ('tool_readback_enabled', 'false'::jsonb)
on conflict (key) do nothing;

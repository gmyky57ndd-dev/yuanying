-- ES-082: every fenshen gets the full tool set by default.
-- Keep tools_whitelist for future strict isolation (has_all_tools=false).
alter table fenshen add column if not exists has_all_tools boolean not null default true;
update fenshen set has_all_tools = true where has_all_tools is null;

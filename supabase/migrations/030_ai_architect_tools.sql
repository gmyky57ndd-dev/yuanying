-- ES-079: complete the architect fenshen tool whitelist.
update fenshen
set tools_whitelist = '["web_search","search_local_kb","read_local_file","write_local_file","read_code_file","get_issue_status","trigger_reindex"]'::jsonb,
    kind = 'professional'
where id = 'ai_architect';

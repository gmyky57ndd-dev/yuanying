-- Issue #94 follow-up: the default Yuanying workpad must include the
-- professional fenshen, otherwise only 小悟 can be addressed there.
insert into project_fenshen_map (project_id, fenshen_id, is_lead)
values
  ('yuanying', 'ai_pm', false),
  ('yuanying', 'ai_architect', false),
  ('aso', 'ai_architect', false)
on conflict (project_id, fenshen_id) do nothing;

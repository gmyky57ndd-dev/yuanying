-- #78: the vitamin reminder window started at 07:00, before the owner usually
-- wakes, so a 07:26 notification could be (mis)tapped and mark the day complete.
-- Align it with the sprint spec (08:30) so it cannot fire before wake by default.
update habits
set reminder = jsonb_set(reminder, '{window,start}', '"08:30"'),
    updated_at = now()
where name = 'vitamin';

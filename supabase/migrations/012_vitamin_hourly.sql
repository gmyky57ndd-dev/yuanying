-- ES-013 / habits (2026-10-16): vitamin hourly-until-confirmed.
-- Vitamin becomes an interval habit that fires hourly during wake time and
-- stops for the day once confirmed (a `vitamin` signal exists).
update habits
  set reminder = jsonb_build_object(
    'days', 'daily',
    'mode', 'interval',
    'window', jsonb_build_object('start', '07:00', 'end', '22:00'),
    'condition', jsonb_build_object('kind', 'count_below_target', 'value', 1),
    'interval_min', 60,
    'text_override', null,
    'voice_override', null
  )
  where name = 'vitamin';

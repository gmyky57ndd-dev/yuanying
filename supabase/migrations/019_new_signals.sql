-- ES-037 — New signals: manual_work & body_flag + 21:30 evening check-in.

alter table signals drop constraint if exists v4_signal_name;
alter table signals drop constraint if exists v5_signal_name;
alter table signals add constraint v5_signal_name check (
  name in (
    'wake','sleep','water','steps','app_usage','phone_unlock','brief_wake',
    'note','reminder_shown','reminder_acted','standup','vitamin','session',
    'manual_work','body_flag'
  )
) not valid;

alter table reminders drop constraint if exists reminders_name_check;
alter table reminders add constraint reminders_name_check check (
  name in ('water','standup','vitamin','evening_checkin')
);

insert into habits (name, display_name, type, reminder, capture_config, target, active)
values (
  'evening_checkin', '收工', 'event',
  '{"mode":"fixed","times":["21:30"],"days":"daily","text_override":"收工打卡 · 写一句今日反思","voice_override":"今天收工了吗？写一句反思。"}'::jsonb,
  '{"method":"manual"}'::jsonb,
  null,
  true
)
on conflict (name) do nothing;

update config
  set value = value || '{"evening_checkin":true}'::jsonb
  where key = 'reminders_enabled';
insert into config (key, value)
values ('reminders_enabled', '{"water":true,"standup":true,"vitamin":true,"evening_checkin":true}'::jsonb)
on conflict (key) do nothing;

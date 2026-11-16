-- DeepSeek API only accepts deepseek-flash / deepseek-v4-pro (error request b29159c1).
update models set model_name = 'deepseek-flash' where id = 'deepseek-flash-1017';

insert into models (id, provider, model_name, base_url)
values ('deepseek-v4-pro', 'deepseek', 'deepseek-v4-pro', 'https://api.deepseek.com/v1')
on conflict (id) do nothing;

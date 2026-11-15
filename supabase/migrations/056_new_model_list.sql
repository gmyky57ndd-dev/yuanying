-- #175 follow-up: new OpenRouter vendor models.
insert into models (id, provider, model_name, base_url)
values
  ('deepseek-flash-1017', 'deepseek', 'deepseek-flash-1017', 'https://api.deepseek.com/v1'),
  ('baidu-ernie-5.5-flash-preview-free', 'baidu', 'ernie-5.5-flash-preview:free', 'https://openrouter.ai/api/v1'),
  ('z-ai-glm-5.2-free', 'z-ai', 'glm-5.2:free', 'https://openrouter.ai/api/v1'),
  ('nvidia-nemotron-3-ultra-550b-a55b-free', 'nvidia', 'nemotron-3-ultra-550b-a55b:free', 'https://openrouter.ai/api/v1'),
  ('qwen-qwen3-coder-free', 'qwen', 'qwen3-coder:free', 'https://openrouter.ai/api/v1'),
  ('minimax-minimax-m2.5-free', 'minimax', 'minimax-m2.5:free', 'https://openrouter.ai/api/v1'),
  ('dots-studio-dots3-note-free', 'dots-studio', 'dots3-note:free', 'https://openrouter.ai/api/v1'),
  ('nvidia-nemotron-3.5-super-vl-free', 'nvidia', 'nemotron-3.5-super-vl:free', 'https://openrouter.ai/api/v1'),
  ('moonshotai-kimi-k2.6-free', 'moonshotai', 'kimi-k2.6:free', 'https://openrouter.ai/api/v1')
on conflict (id) do nothing;

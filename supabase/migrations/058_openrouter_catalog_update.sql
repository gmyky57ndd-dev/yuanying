-- 2026-11-19 OpenRouter catalog cleanup.
-- Keep only slugs currently present in /api/v1/models.
insert into models (id, provider, model_name, base_url)
values
  ('particle-ai-particle-1-free', 'particle-ai', 'particle-1:free', 'https://openrouter.ai/api/v1'),
  ('openrouter-auto', 'openrouter', 'openrouter/auto', 'https://openrouter.ai/api/v1')
on conflict (id) do nothing;

-- Removed from the live catalog (2026-11-19).
delete from models
where id in (
  'z-ai-glm-5.2-free',
  'qwen-qwen3-coder-free',
  'minimax-minimax-m2.5-free',
  'dots-studio-dots3-note-free',
  'moonshotai-kimi-k2.6-free'
);

-- Do not leave fenshen pinned to a removed/free upstream.
update fenshen
set model_name = null,
    primary_model = null,
    backup_model = null
where primary_model in (
  'z-ai-glm-5.2-free',
  'qwen-qwen3-coder-free',
  'minimax-minimax-m2.5-free',
  'dots-studio-dots3-note-free',
  'moonshotai-kimi-k2.6-free'
)
or backup_model in (
  'z-ai-glm-5.2-free',
  'qwen-qwen3-coder-free',
  'minimax-minimax-m2.5-free',
  'dots-studio-dots3-note-free',
  'moonshotai-kimi-k2.6-free'
);

-- Free Baidu was the 429 source; make the generic auto-router the default.
update config set value = to_jsonb('openrouter-auto'::text) where key = 'active_model_id';
update fenshen set model_name = null, primary_model = null, backup_model = null;

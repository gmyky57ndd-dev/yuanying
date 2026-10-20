import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { LanguageModel } from 'ai';
import { supabase } from './db';

type ModelRow = {
  id: string;
  provider: string;
  model_name: string;
  api_key: string | null;
  base_url: string | null;
};

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

async function getActiveModelId(): Promise<string> {
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'active_model_id')
    .maybeSingle();
  return typeof data?.value === 'string' ? data.value : 'deepseek-chat';
}

function apiKeyFor(model: ModelRow): string {
  if (model.api_key) return model.api_key;
  if (model.provider === 'deepseek') return process.env.DEEPSEEK_API_KEY ?? '';
  if (model.provider === 'anthropic') return process.env.ANTHROPIC_API_KEY ?? '';
  if (model.provider === 'openai') return process.env.OPENAI_API_KEY ?? '';
  return '';
}

export async function getModel(modelId?: string): Promise<LanguageModel> {
  const id = modelId || (await getActiveModelId());

  const { data, error } = await supabase
    .from('models')
    .select('id, provider, model_name, api_key, base_url')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`model lookup failed: ${error.message}`);
  if (!data) throw new Error(`model not found: ${id}`);

  const model = data as ModelRow;
  const apiKey = apiKeyFor(model);

  switch (model.provider) {
    case 'deepseek': {
      if (!apiKey) throw new Error(`missing API key for ${model.id}`);
      const deepseek = createOpenAI({
        baseURL: model.base_url || DEEPSEEK_BASE_URL,
        apiKey,
      });
      return deepseek(model.model_name);
    }
    case 'openai': {
      if (!apiKey) throw new Error(`missing API key for ${model.id}`);
      const openai = createOpenAI({
        apiKey,
        ...(model.base_url ? { baseURL: model.base_url } : {}),
      });
      return openai(model.model_name);
    }
    case 'anthropic': {
      if (!apiKey) throw new Error(`missing API key for ${model.id}`);
      const anthropic = createAnthropic({
        apiKey,
        ...(model.base_url ? { baseURL: model.base_url } : {}),
      });
      return anthropic(model.model_name);
    }
    case 'custom': {
      if (!model.base_url) {
        throw new Error(`missing base URL for ${model.id}`);
      }
      const custom = createOpenAI({
        baseURL: model.base_url,
        apiKey: apiKey || 'not-needed',
      });
      return custom(model.model_name);
    }
    default:
      throw new Error(`unsupported provider: ${model.provider}`);
  }
}

export type ActiveModelInfo = {
  id: string;
  provider: string;
  model_name: string;
  base_url: string | null;
  has_api_key: boolean;
};

/** ES-029 / Issue #20: safe model info for 元婴 (never includes the key). */
export async function getActiveModelInfo(): Promise<ActiveModelInfo | null> {
  const id = await getActiveModelId();
  const { data, error } = await supabase
    .from('models')
    .select('id, provider, model_name, api_key, base_url')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`model lookup failed: ${error.message}`);
  if (!data) return null;

  const model = data as ModelRow;
  return {
    id: model.id,
    provider: model.provider,
    model_name: model.model_name,
    base_url: model.base_url,
    has_api_key: !!apiKeyFor(model),
  };
}

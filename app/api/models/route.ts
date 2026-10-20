import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDERS = ['deepseek', 'openai', 'anthropic', 'custom'] as const;
const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/v1',
};

function field(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET() {
  const [{ data: rows, error }, { data: cfg }] = await Promise.all([
    supabase
      .from('models')
      .select('id, provider, model_name, api_key, base_url, created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('config')
      .select('value')
      .eq('key', 'active_model_id')
      .maybeSingle(),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const active =
    typeof cfg?.value === 'string' ? cfg.value : 'deepseek-chat';

  return NextResponse.json({
    models: (rows ?? []).map((m: any) => ({
      id: m.id,
      provider: m.provider,
      model_name: m.model_name,
      base_url: m.base_url,
      has_api_key: !!m.api_key,
      created_at: m.created_at,
    })),
    active,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = field(body?.provider);
    const modelName = field(body?.model_name);
    const apiKey = field(body?.api_key);
    const baseUrl = field(body?.base_url);
    const id = field(body?.id) || modelName;

    if (!PROVIDERS.includes(provider as (typeof PROVIDERS)[number])) {
      return NextResponse.json({ error: 'invalid provider' }, { status: 400 });
    }
    if (!modelName) {
      return NextResponse.json(
        { error: 'model_name required' },
        { status: 400 }
      );
    }
    if (provider === 'custom' && !baseUrl) {
      return NextResponse.json(
        { error: 'base_url required for custom' },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('models').insert({
      id,
      provider,
      model_name: modelName,
      api_key: apiKey || null,
      base_url: baseUrl || DEFAULT_BASE_URLS[provider] || null,
    });

    if (error) {
      const status = error.code === '23505' ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = field(body?.active_model_id);
    if (!id) {
      return NextResponse.json(
        { error: 'active_model_id required' },
        { status: 400 }
      );
    }

    const { data: model } = await supabase
      .from('models')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!model) {
      return NextResponse.json({ error: 'no such model' }, { status: 404 });
    }

    const { error } = await supabase
      .from('config')
      .upsert(
        { key: 'active_model_id', value: id },
        { onConflict: 'key' }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, active: id });
  } catch {
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const { data: cfg } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'active_model_id')
    .maybeSingle();
  if (typeof cfg?.value === 'string' && cfg.value === id) {
    return NextResponse.json(
      { error: 'cannot delete the active model' },
      { status: 400 }
    );
  }

  const { error } = await supabase.from('models').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

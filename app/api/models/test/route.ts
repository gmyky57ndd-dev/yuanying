import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel } from '@/lib/llm-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id required' },
        { status: 400 }
      );
    }

    const model = await getModel(id);
    const result = await generateText({
      model,
      prompt: 'Reply with the single word: ok',
      maxTokens: 8,
    });

    return NextResponse.json({ success: true, reply: result.text.trim() });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'model test failed';
    return NextResponse.json({ success: false, error: message });
  }
}

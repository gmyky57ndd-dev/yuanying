import { NextRequest, NextResponse } from 'next/server';
import { buildSystemPrompt } from '@/lib/yuanying';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    // Load recent history
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(20);

    // Load today's signals
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: todaysSignals } = await supabase
      .from('signals')
      .select('name, value, created_at')
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false });

    const signalSummary =
      todaysSignals && todaysSignals.length > 0
        ? `\n\nToday's signals:\n${todaysSignals
            .map(s => `- ${s.name} at ${s.created_at}`)
            .join('\n')}`
        : '\n\nNo signals logged today yet.';

    const messages = [
      { role: 'system', content: buildSystemPrompt() + signalSummary },
      ...((history ?? []).reverse()),
      { role: 'user', content: message },
    ];

    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('DeepSeek error:', err);
      return NextResponse.json(
        { error: 'model request failed' },
        { status: 502 }
      );
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? '…';

    await supabase.from('messages').insert([
      { role: 'user', content: message },
      { role: 'assistant', content: reply },
    ]);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('chat route error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

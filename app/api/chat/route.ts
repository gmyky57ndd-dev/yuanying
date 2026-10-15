import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { buildSystemPrompt } from '@/lib/yuanying';
import { supabase } from '@/lib/db';
import { getTodayRange, getConfigTimezone } from '@/lib/timezone';
import { getTodaySummaryCached } from '@/lib/summary-generator';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const message = body?.message;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    if (message.length > 4000) {
      return NextResponse.json(
        { error: 'message too long (max 4000)' },
        { status: 400 }
      );
    }

    const session_id: string = body.session_id ?? randomUUID();

    // 1. Load history
    const { data: history, error: histErr } = await supabase
      .from('messages')
      .select('role, content')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(20);

    if (histErr) {
      console.error('history load failed:', histErr);
      // Non-fatal: continue with empty history
    }

    // 2. Today's data (user's configured timezone; AGENTS.md §6)
    const tz = await getConfigTimezone();
    const { start: startOfDay, end: endOfDay } = getTodayRange(tz);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const [signalsRes, stepsRes, goalRes, remindersRes] = await Promise.all([
      supabase
        .from('signals')
        .select('name, created_at')
        .gte('created_at', startOfDay.toISOString())
        .lt('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: true }),
      supabase
        .from('signals')
        .select('value')
        .eq('name', 'steps')
        .gte('created_at', startOfDay.toISOString())
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('config')
        .select('value')
        .eq('key', 'steps_goal')
        .maybeSingle(),
      supabase
        .from('reminders')
        .select('name, scheduled_at, context')
        .gte('scheduled_at', twoHoursAgo.toISOString())
        .order('scheduled_at', { ascending: true }),
    ]);

    const todaysSignals = (signalsRes.data ?? []) as Array<{
      name: string;
      created_at: string;
    }>;

    // Today's summary ("看今天的简报").
    let summaryData = undefined;
    try {
      summaryData = (await getTodaySummaryCached()).data;
    } catch (e) {
      console.error('summary load failed (non-fatal):', e);
    }

    // 3. Build system prompt
    const systemPrompt = buildSystemPrompt({
      signals: todaysSignals,
      now: new Date().toISOString(),
      steps: stepsRes.data?.[0]?.value ?? null,
      stepsGoal: goalRes.data?.value ?? 5000,
      waterCount: todaysSignals.filter(s => s.name === 'water').length,
      recentReminders: remindersRes.data ?? [],
      summary: summaryData,
      message,
    });

    // 4. Assemble messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...((history ?? []).reverse()),
      { role: 'user', content: message },
    ];

    // 5. Call DeepSeek
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let reply: string;

    try {
      const res = await fetch(
        'https://api.deepseek.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
            messages,
            temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE ?? '0.7'),
            max_tokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS ?? '800'),
          }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error('DeepSeek error:', res.status, errText);
        return NextResponse.json(
          { error: 'model request failed' },
          { status: 502 }
        );
      }

      const data = await res.json();
      reply = data.choices?.[0]?.message?.content ?? '…';
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return NextResponse.json({ error: 'model timeout' }, { status: 504 });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    // 6. Persist
    const { error: insErr } = await supabase.from('messages').insert([
      { role: 'user', content: message, session_id },
      { role: 'assistant', content: reply, session_id },
    ]);

    if (insErr) {
      console.error('insert failed:', insErr);
      // Non-fatal: still return reply
    }

    console.log(`chat ok in ${Date.now() - startTime}ms`);
    return NextResponse.json({ reply, session_id });
  } catch (err) {
    console.error('chat route error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

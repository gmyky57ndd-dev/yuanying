import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDateInTimezone } from '@/lib/timezone';
import { generateSummary, SUMMARY_TONE_RULES } from '@/lib/summary-generator';
import { getModel } from '@/lib/llm-router';
import { pushToActiveDevices } from '@/lib/push';
import { recordSystemEvent } from '@/lib/system-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * #84 / ES-069: the morning briefing is a *plan*, not a summary.
 * "Evening closes the day, morning opens it."
 *
 * Reads yesterday's notes/conversations, writes 1–3 concrete things to continue
 * today, stores the message and pushes it. Idempotent per product day.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const dry = new URL(req.url).searchParams.get('dry') === '1';

  try {
    const tz = await getConfigTimezone();
    const today = getDateInTimezone(tz);
    const yesterday = new Date(`${today}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayDate = yesterday.toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .filter('metadata->>type', 'eq', 'morning_brief')
      .filter('metadata->>date', 'eq', today)
      .limit(1)
      .maybeSingle();
    if (existing && !dry) {
      return NextResponse.json({ ok: true, skipped: 'already_generated', date: today });
    }

    const summary = await generateSummary({ date: yesterdayDate, timezone: tz });
    const data = summary.data as any;
    const compact = {
      yesterday: yesterdayDate,
      notes: data?.notes ?? null,
      conversations: Array.isArray(data?.conversations)
        ? data.conversations.slice(0, 5)
        : null,
      water: data?.water ?? null,
      steps: data?.steps ?? null,
      standup: data?.standup ?? null,
    };

    const model = await getModel();
    const { text } = await generateText({
      model,
      system: `你是元婴。现在是早晨。${SUMMARY_TONE_RULES}

这是一天的开头，不是总结。不要复述昨天的数字，不要写「今天……」式总结。基于昨天留下的笔记与对话，给出今天要接续的 1–3 件事：具体、可执行、像伙伴在提醒。不用列表，2–3 句。`,
      prompt: `昨天的记录（JSON）：\n${JSON.stringify(compact)}\n\n写今天早上要说的话。`,
      maxTokens: 320,
    });

    const body =
      text?.trim() ||
      `早上好。昨天留下的记录不多，今天想先推进哪一件？`;

    if (dry) return NextResponse.json({ ok: true, dry: true, date: today, text: body });

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        role: 'assistant',
        content: body,
        session_id: null,
        device_id: null,
        metadata: { type: 'morning_brief', date: today, from: yesterdayDate },
      })
      .select('id')
      .single();
    if (error) throw new Error(`insert failed: ${error.message}`);

    const push = await pushToActiveDevices({
      title: '元婴',
      body: body.length > 180 ? `${body.slice(0, 178)}…` : body,
      url: '/',
    });

    await recordSystemEvent({
      route: '/api/cron/morning-brief',
      status: 200,
      duration_ms: Date.now() - started,
      error: null,
      meta: { date: today, message_id: inserted?.id ?? null, push },
    });

    return NextResponse.json({ ok: true, date: today, message_id: inserted?.id, push });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'morning brief failed';
    await recordSystemEvent({
      route: '/api/cron/morning-brief',
      status: 500,
      duration_ms: Date.now() - started,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

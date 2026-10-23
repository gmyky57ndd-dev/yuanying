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
 * ES-065: the cloud cron trigger. GitHub Actions calls this at 01:30 UTC
 * (21:30 EDT) with `Authorization: Bearer $CRON_SECRET`.
 *
 * It generates one prose evening summary, stores it as an assistant message and
 * pushes it to the devices that are active in `device_presence`.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const started = Date.now();

  try {
    const tz = await getConfigTimezone();
    const date = getDateInTimezone(tz);

    // Idempotent: one summary per product day.
    const { data: existing } = await supabase
      .from('messages')
      .select('id, content')
      .filter('metadata->>type', 'eq', 'daily_summary')
      .filter('metadata->>date', 'eq', date)
      .limit(1)
      .maybeSingle();
    if (existing && !dry) {
      return NextResponse.json({
        ok: true,
        skipped: 'already_generated',
        date,
        message_id: existing.id,
      });
    }

    const summary = await generateSummary({ date, timezone: tz });
    const data = summary.data as any;
    const compact = {
      date,
      timezone: tz,
      notes: data?.notes ?? null,
      water: data?.water ?? null,
      steps: data?.steps ?? null,
      wake: data?.wake ?? null,
      sleep: data?.sleep ?? null,
      standup: data?.standup ?? null,
      vitamins: data?.vitamins ?? null,
      conversations: Array.isArray(data?.conversations)
        ? data.conversations.slice(0, 5)
        : null,
    };

    const model = await getModel();
    const { text } = await generateText({
      model,
      system: `你是元婴。用第一人称写今天的收尾总结。${SUMMARY_TONE_RULES}`,
      prompt: `今天的记录如下（JSON）：\n${JSON.stringify(compact)}\n\n写 2–3 句人话：先说今天的重点（优先 notes），数字只作背景，不列清单，不给健康建议。最后用一句话问主人要不要把这段存下来。`,
      maxTokens: 320,
    });

    const body =
      text?.trim() ||
      `今天的数据我拿到了，但没能写成一句话。记录在 ${date}，要我重试吗？`;

    if (dry) {
      return NextResponse.json({ ok: true, dry: true, date, text: body });
    }

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        role: 'assistant',
        content: body,
        session_id: null,
        device_id: null,
        metadata: { type: 'daily_summary', date, tz },
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
      route: '/api/cron/daily-summary',
      status: 200,
      duration_ms: Date.now() - started,
      error: null,
      meta: { date, message_id: inserted?.id ?? null, push },
    });

    return NextResponse.json({
      ok: true,
      date,
      message_id: inserted?.id ?? null,
      push,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'daily summary failed';
    await recordSystemEvent({
      route: '/api/cron/daily-summary',
      status: 500,
      duration_ms: Date.now() - started,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

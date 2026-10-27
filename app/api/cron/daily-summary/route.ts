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
    const today = getDateInTimezone(tz);
    // #86/#87: GitHub's scheduler is frequently delayed by hours (observed:
    // 01:30 UTC job actually ran at 06:26). Trust the local clock, not the cron:
    // before noon we are closing out *yesterday*; in the evening, today.
    const localHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        hour12: false,
      }).format(new Date())
    );
    const explicitDate = new URL(req.url).searchParams.get('date');
    const date =
      explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)
        ? explicitDate
        : localHour < 12
          ? (() => {
              const y = new Date(`${today}T12:00:00Z`);
              y.setUTCDate(y.getUTCDate() - 1);
              return y.toISOString().slice(0, 10);
            })()
          : today;
    const isToday = date === today;
    const label = isToday ? '今天' : '昨天';

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
        label,
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
      system: `你是元婴。用第一人称写${label}（${date}）的收尾总结。${SUMMARY_TONE_RULES}`,
      prompt: `要总结的日期是 ${date}（${label}）。记录如下（JSON）：\n${JSON.stringify(compact)}\n\n写 2–3 句人话：先说${label}的重点（优先 notes），数字只作背景，不列清单，不给健康建议。全为 0 时不要评判主人，说明可能是没记录/休息。最后问一句要不要把这段存下来。`,
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
      label,
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

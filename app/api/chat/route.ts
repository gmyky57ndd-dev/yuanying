import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { buildSystemPrompt, getActiveFenshen } from '@/lib/yuanying';
import { supabase } from '@/lib/db';
import {
  getTodayRange,
  getConfigTimezone,
  getDayRange,
  getDateInTimezone,
} from '@/lib/timezone';
import { getDisplaySummary, generateSummary } from '@/lib/summary-generator';
import { findOrCreateIssue } from '@/lib/github';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** ES-021: tools 元婴 can call instead of being blind to the past. */
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_notes',
      description:
        "Fetch the owner's notes for a specific date (YYYY-MM-DD). Use when the user asks about a specific day or yesterday's thoughts.",
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_conversation_records',
      description:
        'Search distilled AI conversation records and specs for a keyword. Use to recall past design/architecture decisions.',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'Topic or keyword to search' },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_summary',
      description:
        'Fetch the daily summary for a specific date (YYYY-MM-DD).',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'push_to_dev',
      description:
        'Create a GitHub issue for the dev team. Use only when the owner explicitly asks to send a bug report or feedback to dev, after they confirm the title and body.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short, descriptive title' },
          body: {
            type: 'string',
            description:
              'Detailed issue description including problem, findings, and suggestions.',
          },
        },
        required: ['title', 'body'],
      },
    },
  },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function runTool(name: string, args: any): Promise<any> {
  if (name === 'get_notes') {
    const date = String(args?.date ?? '');
    if (!DATE_RE.test(date)) return { error: 'date must be YYYY-MM-DD' };
    const tz = await getConfigTimezone();
    const { start, end } = getDayRange(date, tz);
    const { data } = await supabase
      .from('signals')
      .select('value, created_at')
      .eq('name', 'note')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .limit(50);
    return {
      date,
      notes: (data ?? []).map((r: any) => ({
        text: r.value?.text ?? '',
        at: r.created_at,
      })),
    };
  }

  if (name === 'get_conversation_records') {
    const keyword = String(args?.keyword ?? '').trim();
    if (!keyword) return { error: 'keyword required' };
    const needle = keyword.toLowerCase();

    const searchDir = (rel: string, limit: number, fullExcerpt = false) => {
      const dir = path.join(process.cwd(), rel);
      if (!fs.existsSync(dir)) return [];
      const out: Array<Record<string, string>> = [];
      const files = fs
        .readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse();
      for (const f of files) {
        const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
        const lower = raw.toLowerCase();
        if (!lower.includes(needle)) continue;
        const title = (raw.match(/^#\s+(.+)$/m)?.[1] ?? f).replace(
          /^Conversation Record\s*—\s*/,
          ''
        );
        let snippet: string;
        if (fullExcerpt) {
          // Specs are short; return the distilled decisions, not a keyword
          // window, so the model can answer design questions.
          snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 1800);
        } else {
          const idx = lower.indexOf(needle);
          snippet = raw
            .slice(Math.max(0, idx - 300), idx + 900)
            .replace(/\s+/g, ' ')
            .trim();
        }
        out.push({ file: f, title, snippet });
        if (out.length >= limit) break;
      }
      return out;
    };

    // Return distilled conversation memory AND the relevant spec (specs hold
    // the design decisions; conversations may only mention them in passing).
    const conv = searchDir('core/memory/conversations', 3);
    const specs = searchDir('docs/specs', 4, true);
    return {
      keyword,
      matches: [...conv, ...specs].slice(0, 6),
    };
  }

  if (name === 'push_to_dev') {
    const title = String(args?.title ?? '').trim();
    const body = String(args?.body ?? '').trim();
    if (!title) return { error: 'title required' };
    if (!body) return { error: 'body required' };
    try {
      const issue = await findOrCreateIssue(title, body);
      return {
        success: true,
        issue_url: issue.issue_url,
        number: issue.number,
        already: issue.already ?? false,
      };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : 'github error',
      };
    }
  }

  if (name === 'get_summary') {
    const date = String(args?.date ?? '');
    if (!DATE_RE.test(date)) return { error: 'date must be YYYY-MM-DD' };
    const { data } = await generateSummary({ date });
    return { date, summary: data };
  }

  return { error: `unknown tool: ${name}` };
}

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

    // ES-013: /fenshen <name> switches persona via DB (no deploy).
    const fenshenCmd = message.trim().match(/^\/fenshen(?:\s+(\S+))?\s*$/i);
    if (fenshenCmd) {
      const requested = (fenshenCmd[1] ?? '').toLowerCase();
      let reply: string;

      if (!requested) {
        const active = await getActiveFenshen();
        const { data: all } = await supabase
          .from('fenshen')
          .select('id, display_name')
          .order('id');
        const list = (all ?? [])
          .map(f => `${f.id} (${f.display_name})`)
          .join(', ');
        reply = `Active: ${active?.display_name ?? 'unknown'}. Available: ${list}.`;
      } else {
        const { data: row } = await supabase
          .from('fenshen')
          .select('id, display_name')
          .eq('id', requested)
          .maybeSingle();

        if (!row) {
          reply = `No Fenshen named "${requested}".`;
        } else {
          const { error: cfgErr } = await supabase
            .from('config')
            .upsert(
              { key: 'active_fenshen', value: row.id },
              { onConflict: 'key' }
            );
          if (cfgErr) {
            console.error('fenshen switch failed:', cfgErr);
            reply = 'Switch failed.';
          } else {
            reply = `Switched to ${row.display_name}.`;
          }
        }
      }

      await supabase.from('messages').insert([
        { role: 'user', content: message, session_id },
        { role: 'assistant', content: reply, session_id },
      ]);
      return NextResponse.json({ reply, session_id });
    }

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

    const [signalsRes, stepsRes, goalRes, remindersRes, feedbackRes] =
      await Promise.all([
      supabase
        .from('signals')
        .select('name, created_at')
        .gte('created_at', startOfDay.toISOString())
        .lt('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: true }),
      supabase
        .from('signals')
        .select('value, context, created_at')
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
      // ES-018: recent feedback notes + status for self-awareness.
      supabase
        .from('signals')
        .select('value, feedback_status, context, created_at')
        .eq('name', 'note')
        .filter('value->>feedback', 'eq', 'true')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const todaysSignals = (signalsRes.data ?? []) as Array<{
      name: string;
      created_at: string;
    }>;

    // Display-day summary (ES-007 §1: last completed day).
    let summaryData = undefined;
    let summaryLabel: string | undefined;
    try {
      const display = await getDisplaySummary();
      summaryData = display.data;
      summaryLabel = display.label;
    } catch (e) {
      console.error('summary load failed (non-fatal):', e);
    }

    // 3. Build system prompt (Core + active Fenshen from DB)
    const systemPrompt = await buildSystemPrompt({
      signals: todaysSignals,
      now: new Date().toISOString(),
      steps: stepsRes.data?.[0]?.value ?? null,
      stepsGoal: goalRes.data?.value ?? 5000,
      stepsContext: stepsRes.data?.[0]?.context ?? null,
      waterCount: todaysSignals.filter(s => s.name === 'water').length,
      recentReminders: remindersRes.data ?? [],
      feedbackNotes: (
        (feedbackRes.data ?? []) as Array<{
          value: any;
          feedback_status: string | null;
          context: any;
        }>
      ).map(r => ({
        text: r.value?.text ?? '',
        status: r.feedback_status ?? 'new',
        issue_url: r.context?.github_issue_url ?? null,
      })),
      summary: summaryData,
      summaryLabel,
      timezone: tz,
      today: getDateInTimezone(tz),
      message,
    });

    // 4. Assemble messages
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...((history ?? []).reverse()),
      { role: 'user', content: message },
    ];

    // 5. Call DeepSeek, executing tool calls in a bounded loop.
    let reply = '';
    for (let step = 0; step < 3; step++) {
      let data: any;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

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
              temperature: parseFloat(
                process.env.DEEPSEEK_TEMPERATURE ?? '0.7'
              ),
              max_tokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS ?? '800'),
              tools: TOOLS,
              tool_choice: 'auto',
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

        data = await res.json();
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return NextResponse.json({ error: 'model timeout' }, { status: 504 });
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }

      const msg = data.choices?.[0]?.message;
      const toolCalls = msg?.tool_calls;

      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: msg.content ?? null,
          tool_calls: toolCalls,
        });
        for (const tc of toolCalls) {
          let result: any;
          try {
            const args = tc.function?.arguments
              ? JSON.parse(tc.function.arguments)
              : {};
            console.log('tool_call', tc.function?.name, args);
            result = await runTool(tc.function?.name, args);
          } catch (e) {
            console.error('tool failed:', e);
            result = { error: 'tool failed' };
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      reply = msg?.content ?? '…';
      break;
    }

    if (!reply) reply = '…';

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

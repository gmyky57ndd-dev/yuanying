import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { streamText, tool } from 'ai';
import { z } from 'zod';
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
import { getActiveModelInfo, getModel } from '@/lib/llm-router';
import { importDriveDoc } from '@/lib/google-drive';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
    if (!title) {
      return {
        success: false,
        issue_url: null,
        number: null,
        already: false,
        error: 'title required',
      };
    }
    if (!body) {
      return {
        success: false,
        issue_url: null,
        number: null,
        already: false,
        error: 'body required',
      };
    }
    try {
      const issue = await findOrCreateIssue(title, body);
      return {
        success: true,
        issue_url: issue.issue_url,
        number: issue.number,
        already: issue.already,
        error: null,
      };
    } catch (e) {
      return {
        success: false,
        issue_url: null,
        number: null,
        already: false,
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

  if (name === 'get_drive_doc') {
    const file = String(args?.file_id ?? '').trim();
    if (!file) return { success: false, error: 'file_id required' };
    return importDriveDoc(file);
  }

  if (name === 'get_model_info') {
    const info = await getActiveModelInfo();
    if (!info) {
      return { success: false, error: 'active model not found' };
    }
    return { success: true, model: info };
  }

  return { error: `unknown tool: ${name}` };
}

async function runToolSafely(name: string, args: Record<string, unknown>) {
  try {
    return await runTool(name, args);
  } catch (e) {
    console.error(`tool failed: ${name}`, e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'tool failed',
    };
  }
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
    const messages = [
      ...((history ?? []).slice().reverse() as Array<{
        role: 'user' | 'assistant';
        content: string;
      }>),
      { role: 'user' as const, content: message },
    ];

    // 5. Route through the configured model and stream the reply.
    let model;
    try {
      model = await getModel();
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'model unavailable';
      console.error('model router failed:', reason);
      return NextResponse.json(
        { success: false, error: reason },
        { status: 502 }
      );
    }

    let pushToDevResult: any = null;

    const tools = {
      get_notes: tool({
        description:
          "Fetch the owner's notes for a specific date (YYYY-MM-DD). Use when the user asks about a specific day or yesterday's thoughts.",
        parameters: z.object({
          date: z.string().describe('Date in YYYY-MM-DD format'),
        }),
        execute: async ({ date }) => runToolSafely('get_notes', { date }),
      }),
      get_conversation_records: tool({
        description:
          'Search distilled AI conversation records and specs for a keyword. Use to recall past design/architecture decisions.',
        parameters: z.object({
          keyword: z.string().describe('Topic or keyword to search'),
        }),
        execute: async ({ keyword }) =>
          runToolSafely('get_conversation_records', { keyword }),
      }),
      get_summary: tool({
        description:
          'Fetch the daily summary for a specific date (YYYY-MM-DD).',
        parameters: z.object({
          date: z.string().describe('Date in YYYY-MM-DD format'),
        }),
        execute: async ({ date }) => runToolSafely('get_summary', { date }),
      }),
      get_drive_doc: tool({
        description:
          'Read a Google Drive document by file ID or URL (Google Docs or a text file) and save it as a note. Use when the owner shares a Drive link or asks to import a legacy document. If Drive is not connected, tell the owner to authorize it in Settings.',
        parameters: z.object({
          file_id: z
            .string()
            .describe('Google Drive file ID or a full Drive URL'),
        }),
        execute: async ({ file_id }) =>
          runToolSafely('get_drive_doc', { file_id }),
      }),
      get_model_info: tool({
        description:
          'Return the active chat model (id, provider, model name, base URL, whether a key is available). Use when the owner asks which model is active, how model switching works, or why behavior changed. Never reveal API keys.',
        parameters: z.object({}),
        execute: async () => runToolSafely('get_model_info', {}),
      }),
      push_to_dev: tool({
        description:
          'Create a GitHub issue for the dev team. Use only when the owner explicitly asks to send a bug report or feedback to dev, after they confirm the title and body.',
        parameters: z.object({
          title: z.string().describe('Short, descriptive title'),
          body: z
            .string()
            .describe(
              'Detailed issue description including problem, findings, and suggestions.'
            ),
        }),
        execute: async ({ title, body }) => {
          const result = await runToolSafely('push_to_dev', { title, body });
          pushToDevResult = result;
          // Structured, body-free result log for future incident review.
          console.log('tool_result push_to_dev', {
            success: result?.success ?? null,
            number: result?.number ?? null,
            already: result?.already ?? null,
            error: result?.error ?? null,
          });
          return result;
        },
      }),
    };

    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      maxSteps: 3,
      temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE ?? '0.7'),
      maxTokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS ?? '800'),
      onError: ({ error }) => {
        console.error('model stream error:', error);
      },
      onFinish: async ({ text }) => {
        let reply = text.trim() || '…';

        // ES-022 guard: if the last push_to_dev attempt failed, never let the
        // persisted message claim success or invent an issue URL.
        if (
          pushToDevResult &&
          (pushToDevResult.success === false || pushToDevResult.error)
        ) {
          const reason = pushToDevResult.error ?? 'unknown error';
          reply = `没发成功。系统报错：${reason}`;
        }

        const { error: insErr } = await supabase.from('messages').insert([
          { role: 'user', content: message, session_id },
          { role: 'assistant', content: reply, session_id },
        ]);

        if (insErr) console.error('insert failed:', insErr);

        console.log(`chat ok in ${Date.now() - startTime}ms`);
      },
    });

    return result.toDataStreamResponse({
      getErrorMessage: e =>
        e instanceof Error ? e.message : 'model request failed',
    });
  } catch (err) {
    console.error('chat route error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

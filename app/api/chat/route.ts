import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { StreamData, streamText, tool } from 'ai';
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
import { findOrCreateIssue, getIssue } from '@/lib/github';
import { enqueuePushToDev } from '@/lib/jobs';
import { getActiveModelInfo, getModel } from '@/lib/llm-router';
import { importDriveDoc } from '@/lib/google-drive';
import { webSearch } from '@/lib/web-search';
import { readMarkdown } from '@/lib/read-markdown';
import { writeMarkdown } from '@/lib/write-markdown';
import { scheduleMessage } from '@/lib/scheduler';
import { normalizeToolResult } from '@/lib/tool-result';
import { APP_VERSION } from '@/lib/app-version';
import { ingestExternalChat, queryExternalChats } from '@/lib/external-chats';
import { askClaude } from '@/lib/external-ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function runTool(name: string, args: any): Promise<any> {
  if (name === 'get_notes') {
    const date = String(args?.date ?? '');
    if (!DATE_RE.test(date)) {
      return { success: false, error: 'date must be YYYY-MM-DD' };
    }
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
    const notes = (data ?? []).map((r: any) => ({
      text: r.value?.text ?? '',
      at: r.created_at,
    }));
    return {
      success: true,
      date,
      data: notes,
      meta: {
        count: notes.length,
        message: notes.length > 0 ? 'Notes returned.' : 'No notes found.',
      },
    };
  }

  if (name === 'get_conversation_records') {
    const keyword = String(args?.keyword ?? '').trim();
    if (!keyword) return { success: false, error: 'keyword required' };
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

    const conv = searchDir('core/memory/conversations', 3);
    const specs = searchDir('docs/specs', 4, true);
    const matches = [...conv, ...specs].slice(0, 6);
    return {
      success: true,
      keyword,
      data: matches,
      meta: {
        count: matches.length,
        message:
          matches.length > 0 ? 'Matches returned.' : 'No matches found.',
      },
    };
  }

  if (name === 'push_to_dev') {
    const title = String(args?.title ?? '').trim();
    const body = String(args?.body ?? '').trim();
    if (!title) return { success: false, error: 'title required' };
    if (!body) return { success: false, error: 'body required' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const issue = await findOrCreateIssue(title, body, {
        signal: controller.signal,
      });
      return {
        success: true,
        data: {
          issue_url: issue.issue_url,
          number: issue.number,
          already: issue.already,
        },
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'github error';

      // ES-046: if GitHub is slow/unreachable, enqueue instead of blocking the
      // SSE stream. The queue is processed by the PWA reminder poll.
      if (/abort|timeout|network|fetch failed|ECONN|ETIMEDOUT/i.test(reason)) {
        try {
          const job = await enqueuePushToDev(
            title,
            body,
            typeof args?.session_id === 'string' ? args.session_id : undefined
          );
          return {
            success: true,
            data: {
              queued: true,
              job_id: job.id,
              message: '任务已进入后台队列，稍后确认',
            },
          };
        } catch (queueError) {
          return {
            success: false,
            error:
              queueError instanceof Error
                ? `GitHub timeout and queue failed: ${queueError.message}`
                : 'GitHub timeout and queue failed',
          };
        }
      }

      return { success: false, error: reason };
    } finally {
      clearTimeout(timer);
    }
  }

  if (name === 'get_summary') {
    const date = String(args?.date ?? '');
    if (!DATE_RE.test(date)) {
      return { success: false, error: 'date must be YYYY-MM-DD' };
    }
    const { data } = await generateSummary({ date });
    return { success: true, date, data };
  }

  if (name === 'get_drive_doc') {
    const file = String(args?.file_id ?? '').trim();
    if (!file) return { success: false, error: 'file_id required' };
    return importDriveDoc(file, {
      entry: args?.entry ? String(args.entry) : undefined,
      start_date: args?.start_date ? String(args.start_date) : undefined,
      end_date: args?.end_date ? String(args.end_date) : undefined,
      filter_column: args?.filter_column
        ? String(args.filter_column)
        : undefined,
      filter_value: args?.filter_value
        ? String(args.filter_value)
        : undefined,
    });
  }

  if (name === 'get_model_info') {
    const info = await getActiveModelInfo();
    if (!info) {
      return { success: false, error: 'active model not found' };
    }
    return { success: true, data: info };
  }

  if (name === 'web_search') {
    const query = String(args?.query ?? '').trim();
    if (!query) return { success: false, error: 'query required' };
    const result = await webSearch(query);
    return {
      success: true,
      provider: result.provider,
      data: result.results,
      meta: {
        count: result.results.length,
        message:
          result.results.length > 0 ? 'Results returned.' : 'No results found.',
      },
    };
  }

  if (name === 'read_markdown') {
    const filePath = String(args?.path ?? '').trim();
    if (!filePath) return { success: false, error: 'path required' };
    const file = await readMarkdown(filePath);
    return {
      success: true,
      data: file.text,
      meta: {
        path: file.path,
        total_chars: file.total_chars,
        returned_chars: file.text.length,
        truncated: file.truncated,
        message: file.truncated
          ? 'Markdown truncated at 20,000 characters.'
          : 'Complete Markdown returned.',
      },
    };
  }

  if (name === 'get_issue') {
    const issueNumber = Number(args?.issue_number);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      return { success: false, error: 'issue_number must be a positive integer' };
    }
    const issue = await getIssue(issueNumber);
    return { success: true, data: issue };
  }

  if (name === 'write_markdown') {
    const filePath = String(args?.path ?? '').trim();
    const content = String(args?.content ?? '');
    if (!filePath) return { success: false, error: 'path required' };
    if (!content.trim()) return { success: false, error: 'content required' };
    return writeMarkdown(filePath, content);
  }

  if (name === 'scheduler') {
    const time = String(args?.time ?? '').trim();
    const action = String(args?.action ?? '').trim();
    if (!time) return { success: false, error: 'time required' };
    if (!action) return { success: false, error: 'action required' };
    return scheduleMessage(time, action);
  }

  if (name === 'ingest_external_chat') {
    const source = String(args?.source ?? 'external').trim();
    const content = String(args?.content ?? '');
    return ingestExternalChat(source || 'external', content);
  }

  if (name === 'query_external_chats') {
    const query = String(args?.query ?? '').trim();
    if (!query) return { success: false, error: 'query required' };
    return queryExternalChats(query);
  }

  if (name === 'ask_claude') {
    const prompt = String(args?.prompt ?? '').trim();
    if (!prompt) return { success: false, error: 'prompt required' };
    return askClaude(prompt);
  }

  return { success: false, error: `unknown tool: ${name}` };
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

    // 1. Load history (ES-045: respect the last Chat Reset).
    const { data: resetCfg } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'chat_reset_at')
      .maybeSingle();
    const resetAt =
      typeof resetCfg?.value === 'string' ? resetCfg.value : null;

    const { data: readbackCfg } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'tool_readback_enabled')
      .maybeSingle();
    const verboseTools = readbackCfg?.value === true;

    let historyQuery = supabase
      .from('messages')
      .select('role, content')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(20);
    if (resetAt) historyQuery = historyQuery.gt('created_at', resetAt);

    const { data: history, error: histErr } = await historyQuery;

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
      toolReadback: verboseTools,
    });

    const modelInfo = await getActiveModelInfo().catch(() => null);
    const { data: bodyRows } = await supabase
      .from('config')
      .select('key, value')
      .in('key', ['collector_version', 'collector_last_report_at']);
    const bodyCfg = Object.fromEntries(
      (bodyRows ?? []).map((row: { key: string; value: unknown }) => [
        row.key,
        row.value,
      ])
    );
    const collectorVersion =
      typeof bodyCfg.collector_version === 'string'
        ? bodyCfg.collector_version
        : '未上报';
    const collectorLastReport =
      typeof bodyCfg.collector_last_report_at === 'string'
        ? bodyCfg.collector_last_report_at
        : 'unknown';
    const bodyStatusReminder = `Authoritative current versions for this request: PWA v${APP_VERSION}; LLM ${
      modelInfo ? `${modelInfo.provider}/${modelInfo.model_name}` : 'unknown'
    }; Collector v${collectorVersion} (last report ${collectorLastReport}). When asked about versions, use these values and ignore any earlier version claims in chat history.`;

    // 4. Assemble messages
    const messages = [
      ...((history ?? []).slice().reverse() as Array<{
        role: 'user' | 'assistant';
        content: string;
      }>),
      {
        role: 'system' as const,
        content:
          `Authoritative tool availability for this request: get_notes, get_conversation_records, get_summary, get_drive_doc, get_model_info, web_search, read_markdown, write_markdown, scheduler, get_issue, ingest_external_chat, query_external_chats, ask_claude, push_to_dev. Ignore any earlier message claiming you lack one of these tools. For current external knowledge or documentation, call web_search. For a repository Markdown file, call read_markdown.

${bodyStatusReminder}`,
      },
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
    const streamData = new StreamData();

    const runToolForModel = async (
      name: string,
      args: Record<string, unknown>
    ) => normalizeToolResult(name, await runToolSafely(name, args), verboseTools);

    const tools = {
      get_notes: tool({
        description:
          "Fetch the owner's notes for a specific date (YYYY-MM-DD). Use when the user asks about a specific day or yesterday's thoughts.",
        parameters: z.object({
          date: z.string().describe('Date in YYYY-MM-DD format'),
        }),
        execute: async ({ date }) => runToolForModel('get_notes', { date }),
      }),
      get_conversation_records: tool({
        description:
          'Search distilled AI conversation records and specs for a keyword. Use to recall past design/architecture decisions.',
        parameters: z.object({
          keyword: z.string().describe('Topic or keyword to search'),
        }),
        execute: async ({ keyword }) =>
          runToolForModel('get_conversation_records', { keyword }),
      }),
      get_summary: tool({
        description:
          'Fetch the daily summary for a specific date (YYYY-MM-DD).',
        parameters: z.object({
          date: z.string().describe('Date in YYYY-MM-DD format'),
        }),
        execute: async ({ date }) => runToolForModel('get_summary', { date }),
      }),
      get_drive_doc: tool({
        description:
          'Read a Google Drive file by ID or URL and save it as a note. Supports Google Docs, txt, md, csv, json, and zip archives. For ZIP files, readable entries are returned separately with per-file truncation metadata; use `entry` to select one file. CSV supports date ranges and column filters. If Drive is not connected, tell the owner to authorize it in Settings.',
        parameters: z.object({
          file_id: z
            .string()
            .describe('Google Drive file ID or a full Drive URL'),
          entry: z
            .string()
            .optional()
            .describe('For ZIP files: exact entry name, e.g. entries.csv'),
          start_date: z
            .string()
            .optional()
            .describe('CSV filter: inclusive start date YYYY-MM-DD'),
          end_date: z
            .string()
            .optional()
            .describe('CSV filter: inclusive end date YYYY-MM-DD'),
          filter_column: z
            .string()
            .optional()
            .describe('CSV filter: exact column name, e.g. water'),
          filter_value: z
            .string()
            .optional()
            .describe('CSV filter value; supports <, <=, >, >=, !=, ='),
        }),
        execute: async args => runToolSafely('get_drive_doc', args),
      }),
      get_model_info: tool({
        description:
          'Return the active chat model (id, provider, model name, base URL, whether a key is available). Use when the owner asks which model is active, how model switching works, or why behavior changed. Never reveal API keys.',
        parameters: z.object({}),
        execute: async () => runToolForModel('get_model_info', {}),
      }),
      web_search: tool({
        description:
          'Search the web for current information, API documentation, technical solutions, or recent news. Use when up-to-date external knowledge is needed. Returns the top 3 results as title/url/snippet text, not raw HTML. Never use it to look up the owner’s private data.',
        parameters: z.object({
          query: z.string().describe('The search query'),
        }),
        execute: async ({ query }) => runToolForModel('web_search', { query }),
      }),
      read_markdown: tool({
        description:
          'Read a Markdown file from the repository by relative path. Allowed roots: docs/specs, docs/help, docs/runbooks, core; plus AGENTS.md, TRACKING.md, README.md. Use when the owner asks to read a spec, runbook, or help doc by path. Returns text, truncated at 20,000 chars.',
        parameters: z.object({
          path: z
            .string()
            .describe(
              'Relative path, e.g. docs/specs/ES-036-web-search.md'
            ),
        }),
        execute: async ({ path }) => runToolForModel('read_markdown', { path }),
      }),
      write_markdown: tool({
        description:
          'Write or update an allowlisted core Markdown file through a Git commit. Only use after the owner explicitly asks to change that file AND confirms the content. Allowed: core/ground-rules.md, core/habits.md, core/opinions/*.md, core/memory/conversations/*.md. The previous version remains in Git history.',
        parameters: z.object({
          path: z.string().describe('Relative path, e.g. core/ground-rules.md'),
          content: z.string().describe('Full new file content'),
        }),
        execute: async ({ path, content }) =>
          runToolForModel('write_markdown', { path, content }),
      }),
      scheduler: tool({
        description:
          'Schedule one short reminder at a local HH:MM time using the existing reminder poller. Max 3 pending scheduled messages; cannot edit/delete existing timers.',
        parameters: z.object({
          time: z.string().describe('Local time HH:MM, e.g. 21:30'),
          action: z.string().describe('What to say, one short sentence'),
        }),
        execute: async ({ time, action }) =>
          runToolForModel('scheduler', { time, action }),
      }),
      ingest_external_chat: tool({
        description:
          'Save an external AI conversation or long design note into persistent external memory. Use when the owner says “记住这段外部对话” or pastes a long external chat. Source is a short label such as “deepseek-web” or “clipboard”.',
        parameters: z.object({
          source: z.string().describe('Short source label'),
          content: z.string().describe('The external conversation text'),
        }),
        execute: async ({ source, content }) =>
          runToolForModel('ingest_external_chat', { source, content }),
      }),
      query_external_chats: tool({
        description:
          'Search imported external AI conversations by keyword. Use before answering questions about past external design discussions.',
        parameters: z.object({
          query: z.string().describe('Keyword or phrase to search'),
        }),
        execute: async ({ query }) =>
          runToolForModel('query_external_chats', { query }),
      }),
      ask_claude: tool({
        description:
          'Ask Claude for a second opinion on a complex design/code question. Only works when ANTHROPIC_API_KEY is configured. Do not use for private data unless the owner asks.',
        parameters: z.object({
          prompt: z.string().describe('Question for Claude'),
        }),
        execute: async ({ prompt }) =>
          runToolForModel('ask_claude', { prompt }),
      }),
      get_issue: tool({
        description:
          'Read a GitHub issue by number, including its state, labels, body, and up to 20 comments. Use after push_to_dev to verify delivery and summarize Dev replies.',
        parameters: z.object({
          issue_number: z.number().int().positive().describe('GitHub issue number'),
        }),
        execute: async ({ issue_number }) =>
          runToolForModel('get_issue', { issue_number }),
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
          streamData.append({ type: 'push_to_dev', status: 'sending' });
          const result = await runToolSafely('push_to_dev', { title, body, session_id });
          pushToDevResult = result;
          // Structured, body-free result log for future incident review.
          console.log('tool_result push_to_dev', {
            success: result?.success ?? null,
            number: result?.data?.number ?? null,
            already: result?.data?.already ?? null,
            error: result?.error ?? null,
          });
          streamData.append({
            type: 'push_to_dev',
            status: 'done',
            success: result?.success === true,
            queued: result?.data?.queued === true,
            job_id: result?.data?.job_id ?? null,
            number: result?.data?.number ?? null,
            error: result?.error ?? null,
          });
          return normalizeToolResult('push_to_dev', result, verboseTools);
        },
      }),
    };

    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      maxSteps: 5,
      temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE ?? '0.7'),
      maxTokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS ?? '800'),
      onError: ({ error }) => {
        console.error('model stream error:', error);
        streamData.close().catch(() => {});
      },
      onFinish: async ({ text }) => {
        let reply = text.trim();
        if (!reply) {
          console.warn('empty model reply', {
            pushToDev: !!pushToDevResult,
          });
        }

        // ES-022 guard: if the last push_to_dev attempt failed, never let the
        // persisted message claim success or invent an issue URL.
        if (
          pushToDevResult &&
          (pushToDevResult.success === false || pushToDevResult.error)
        ) {
          const reason = pushToDevResult.error ?? 'unknown error';
          reply = `没发成功。系统报错：${reason}`;
        } else if (pushToDevResult?.data?.queued === true) {
          reply = `已提交后台队列，稍后确认。（job #${pushToDevResult.data.job_id}）`;
        } else if (
          pushToDevResult?.success === true &&
          typeof pushToDevResult.data?.number === 'number' &&
          pushToDevResult.data?.issue_url
        ) {
          // Issue #21/#24: the persisted success message uses the verified
          // GitHub number/URL, never a model-composed one.
          reply = `发了。#${pushToDevResult.data.number}。\n\n${pushToDevResult.data.issue_url}`;
        } else if (!reply) {
          reply = '我拿到了结果，但这次没组织好回复。再问我一次？';
        }

        if (!text.trim()) {
          // ES-052: guarantee the client receives a visible fallback text even
          // when the model ends with only tool calls (empty final content).
          streamData.append({ type: 'assistant_text', text: reply });
        }

        const { error: insErr } = await supabase.from('messages').insert([
          { role: 'user', content: message, session_id },
          { role: 'assistant', content: reply, session_id },
        ]);

        if (insErr) console.error('insert failed:', insErr);

        await streamData.close();
        console.log(`chat ok in ${Date.now() - startTime}ms`);
      },
    });

    return result.toDataStreamResponse({
      data: streamData,
      getErrorMessage: e =>
        e instanceof Error ? e.message : 'model request failed',
    });
  } catch (err) {
    console.error('chat route error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

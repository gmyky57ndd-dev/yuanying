import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { StreamData, generateText, streamText, tool } from 'ai';
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
import { normalizeToolResult, stripToolMarkers } from '@/lib/tool-result';
import {
  recentSaveQuestionCount,
  hasSaveQuestion,
  stripSaveQuestion,
} from '@/lib/loop-guard';
import { APP_VERSION } from '@/lib/app-version';
import { ingestExternalChat, queryExternalChats } from '@/lib/external-chats';
import { askClaude } from '@/lib/external-ai';
import { askExternalAgent } from '@/lib/mcp-client';
import { readMailbox, writeMailbox } from '@/lib/mailbox';
import {
  recordSystemEvent,
  getRecentSystemEvents,
  describeEvent,
} from '@/lib/system-events';

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
    const needle = keyword.toLowerCase();

    // ES-062: chat history lives in the `messages` table, not only in committed
    // Markdown. Reads are owner-wide — no session_id / device filter — so a
    // question asked on the Mac can see what was said on the phone.
    const { data: recent } = await supabase
      .from('messages')
      .select('id, role, content, created_at, metadata')
      .order('created_at', { ascending: false })
      .limit(2000);
    const rows = (recent ?? []) as any[];

    const clipText = (s: string, n: number) =>
      s.length > n ? `${s.slice(0, n)}…` : s;

    const chatMatches = (needle
      ? rows.filter(m => String(m.content ?? '').toLowerCase().includes(needle))
      : rows
    )
      .slice(0, 6)
      .map(m => ({
        source: 'chat' as const,
        role: m.role,
        at: m.created_at,
        device: m.metadata?.device ?? null,
        snippet: clipText(String(m.content ?? '').replace(/\s+/g, ' ').trim(), 320),
      }));

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

    const fileMatches = needle
      ? [
          ...searchDir('core/memory/conversations', 3),
          ...searchDir('docs/specs', 4, true),
        ]
      : [];

    const matches = [...chatMatches, ...fileMatches].slice(0, 8);
    return {
      success: true,
      keyword,
      data: matches,
      meta: {
        count: matches.length,
        chat_count: chatMatches.length,
        message:
          matches.length > 0
            ? 'Matches returned.'
            : 'No matches found.',
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
    const tz = await getConfigTimezone();
    const today = getDateInTimezone(tz);
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        hour12: false,
      }).format(new Date())
    );
    const requested = String(args?.date ?? '');
    // #ES-070: before 11:00 a summary request means "yesterday", never today.
    let date = DATE_RE.test(requested) ? requested : today;
    if (hour < 11 && date === today) {
      const y = new Date(`${today}T12:00:00Z`);
      y.setUTCDate(y.getUTCDate() - 1);
      date = y.toISOString().slice(0, 10);
    }
    const { data } = await generateSummary({ date });
    return {
      success: true,
      date,
      data,
      note:
        date !== requested && requested
          ? `It is morning: returning ${date} (yesterday) instead of ${requested}.`
          : date !== today && !requested
            ? `It is morning: returning ${date} (yesterday).`
            : undefined,
    };
  }

  if (name === 'get_steps') {
    const wantsRefresh = args?.refresh === true;
    const requestedAt = new Date();
    const tz = await getConfigTimezone();
    const { start, end } = getTodayRange(tz);
    const num = (r: any) => (typeof r?.value === 'number' ? r.value : 0);

    const readRows = async () => {
      const { data } = await supabase
        .from('signals')
        .select('value, context, created_at')
        .eq('name', 'steps')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      return (data ?? []) as any[];
    };

    if (wantsRefresh) {
      // The collector's SyncCheckWorker polls this marker and runs one
      // immediate collection, the same work as the 上报步数 button.
      await supabase.from('config').upsert(
        {
          key: 'collector_sync_requested_at',
          value: requestedAt.toISOString(),
          updated_at: requestedAt.toISOString(),
        },
        { onConflict: 'key' }
      );
    }

    let rows = await readRows();
    let refreshed = false;
    if (wantsRefresh) {
      // Give a wakeful collector up to 16s to answer, then fall back honestly.
      for (let i = 0; i < 8 && !refreshed; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        rows = await readRows();
        refreshed = rows.some(
          r =>
            new Date(r.created_at).getTime() >= requestedAt.getTime() &&
            num(r) > 0
        );
      }
    }

    const { data: cfg } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'steps_goal')
      .maybeSingle();
    const goal = typeof (cfg as any)?.value === 'number' ? (cfg as any).value : 5000;
    // Same rule as /api/steps: prefer the corrected aggregation, max snapshot.
    const corrected = rows.filter(r => r.context?.aggregation === 'max_per_origin');
    const pool = corrected.length > 0 ? corrected : rows;
    // ES-073: a partial (permission-denied) read must never become the daily total.
    const clean = pool.filter((r: any) => r.context?.partial !== true);
    const usable = clean.length > 0 ? clean : rows.filter((r: any) => r.context?.partial !== true);
    const best = usable.reduce((m: any, r: any) => (num(r) > num(m) ? r : m), null as any);
    const lastSync = rows[0] ?? null;
    const latest = usable.find((r: any) => num(r) > 0) ?? null;
    // Only the newest sync matters; an older partial row must not flag today forever.
    const partialRead = rows[0]?.context?.partial === true;
    return {
      success: true,
      data: {
        value: num(best),
        goal,
        as_of: best?.created_at ?? null,
        latest_value: latest ? num(latest) : null,
        latest_at: latest?.created_at ?? null,
        last_sync_at: lastSync?.created_at ?? null,
        last_sync_value: lastSync ? num(lastSync) : null,
        source: best?.context?.source ?? 'collector',
        aggregation: best?.context?.aggregation ?? null,
        timezone: tz,
        window_start: start.toISOString(),
        window_end: end.toISOString(),
        rows_today: rows.length,
        partial_read: partialRead,
        refreshed: wantsRefresh ? refreshed : undefined,
        refresh_pending: wantsRefresh && !refreshed ? true : undefined,
        warning: partialRead
          ? 'A recent HealthConnect read was denied permission (partial data); value comes from the last complete read.'
          : refreshed
          ? undefined
          : wantsRefresh && !refreshed
            ? 'Sync requested but the collector has not answered yet (it polls every 15 minutes). value/as_of are the last stored reading.'
            : lastSync && num(lastSync) === 0 && num(best) > 0
              ? "The most recent sync returned 0 (no HealthConnect origins); value is today's max snapshot, as_of is the last real reading."
              : undefined,
      },
    };
  }

  if (name === 'get_system_status') {
    const events = await getRecentSystemEvents(5);
    const { data: cfgRows } = await supabase
      .from('config')
      .select('key, value')
      .in('key', [
        'collector_version',
        'collector_last_report_at',
        'collector_steps_status',
        'collector_steps_at',
        'collector_steps_error',
      ]);
    const collector = Object.fromEntries(
      ((cfgRows ?? []) as { key: string; value: unknown }[]).map(r => [
        r.key,
        r.value,
      ])
    );
    const last = events[0] ?? null;
    return {
      success: true,
      data: {
        last_event: last
          ? {
              at: last.ts,
              route: last.route,
              status: last.status,
              duration_ms: last.duration_ms,
              error: last.error,
              diagnosis: describeEvent(last),
            }
          : null,
        recent: events.map(e => ({
          at: e.ts,
          route: e.route,
          status: e.status,
          duration_ms: e.duration_ms,
          error: e.error,
        })),
        collector: {
          version: collector.collector_version ?? null,
          last_report_at: collector.collector_last_report_at ?? null,
          steps_status: collector.collector_steps_status ?? null,
          steps_at: collector.collector_steps_at ?? null,
          steps_error: collector.collector_steps_error ?? null,
        },
        note: last
          ? undefined
          : 'No server-side event has been recorded yet.',
      },
    };
  }

  if (name === 'add_note') {
    // ES-071: append-only memory capture. INSERT only — no update, no delete.
    const content = String(args?.content ?? '').trim();
    if (!content) return { success: false, error: 'content required' };
    if (content.length > 2000) {
      return { success: false, error: 'note too long (max 2000 chars)' };
    }
    const tz = await getConfigTimezone();
    const { data, error } = await supabase
      .from('signals')
      .insert({
        name: 'note',
        type: 'note',
        value: {
          text: content,
          tags: [],
          feedbackSuggested: false,
          authored_by: 'yuanying',
        },
        source: 'yuanying_summary',
        context: { source: 'yuanying_summary', via: 'add_note' },
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: { id: data.id, date: getDateInTimezone(tz), text: content },
      message: 'Note appended.',
    };
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

  if (name === 'ask_external_agent') {
    const role = String(args?.role ?? 'architect').trim();
    const prompt = String(args?.prompt ?? '').trim();
    if (!prompt) return { success: false, error: 'prompt required' };
    return askExternalAgent(role || 'architect', prompt);
  }

  if (name === 'read_local_file') {
    const filePath = String(args?.path ?? '').trim();
    if (!filePath) return { success: false, error: 'path required' };
    return readMailbox(filePath);
  }

  if (name === 'write_local_file') {
    const filePath = String(args?.path ?? '').trim();
    const content = String(args?.content ?? '');
    if (!filePath) return { success: false, error: 'path required' };
    if (!content.trim()) return { success: false, error: 'content required' };
    return writeMailbox(filePath, content);
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
    // ES-062: label which device produced the message so 元婴 can say
    // "you said this on your phone" instead of guessing.
    const device =
      typeof body.device === 'string' && body.device.length <= 40
        ? body.device
        : null;
    // ES-063: per-install id, used only for realtime dedupe and presence.
    const device_id =
      typeof body.device_id === 'string' && body.device_id.length <= 80
        ? body.device_id
        : null;

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

      const safeReply = reply.trim() || '（这次没有生成内容，请重试）';
      await supabase.from('messages').insert([
        { role: 'user', content: message, session_id, device_id, metadata: { device } },
        { role: 'assistant', content: safeReply, session_id, device_id, metadata: { device } },
      ]);
      return NextResponse.json({ reply: safeReply, session_id });
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

    // ES-071: explicit note requests are executed server-side. Tool-calling is
    // kept for model-initiated saves, but "记进笔记" must never depend on the
    // model choosing a tool.
    const noteIntent =
      /(记(一)?下|记进|写入?笔记|存进.{0,6}笔记|存到.{0,6}笔记|存进今天|add_note)/i.test(
        message
      );
    let noteSaved: { id: number; text: string } | null = null;
    if (noteIntent) {
      const quoted = message.match(/[「“"]([^」”"]{2,})[」”"]/)?.[1];
      const afterColon = message.match(/[：:]\s*([\s\S]+)$/)?.[1];
      const refersToPrevious = /(这段|上面|总结|刚才)/.test(message);
      const prevAssistant = [...(history ?? [])]
        .reverse()
        .find(h => h.role === 'assistant')?.content as string | undefined;
      const raw =
        quoted ??
        afterColon ??
        (refersToPrevious && prevAssistant ? prevAssistant : message);
      const text = String(raw).trim().slice(0, 2000);
      if (text) {
        const { data: inserted, error: noteError } = await supabase
          .from('signals')
          .insert({
            name: 'note',
            type: 'note',
            value: {
              text,
              tags: [],
              feedbackSuggested: false,
              authored_by: 'yuanying',
            },
            source: 'yuanying_summary',
            context: { source: 'yuanying_summary', via: 'add_note' },
          })
          .select('id')
          .single();
        if (noteError) {
          console.error('add_note direct insert failed:', noteError);
        } else {
          noteSaved = { id: inserted.id, text };
        }
      }
    }

    // ES-067: when the owner has already confirmed a file write, the model must
    // call write_markdown instead of replying "I'll write it now".
    const lastAssistant = [...(history ?? [])]
      .reverse()
      .find(h => h.role === 'assistant')?.content as string | undefined;
    const confirmOnly =
      /^(写吧|现在写|确认|执行|保存|落盘|好[，,]?\s*写|改吧|可以写|写入|写进去)[。！!.\s]*$/i.test(
        message.trim()
      );
    const writeIntent =
      (/\.md\b/i.test(message) && /(写|改|保存|落盘|写入|write|edit)/i.test(message)) ||
      (confirmOnly &&
        !!lastAssistant &&
        (/\.md\b/.test(lastAssistant) || /write_markdown/.test(lastAssistant)));

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
    const repeatSaveQuestion =
      recentSaveQuestionCount((history ?? []) as any, 3) >= 2;
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
          `Authoritative tool availability for this request: get_notes, get_conversation_records, get_summary, get_steps, get_system_status, add_note, get_drive_doc, get_model_info, web_search, read_markdown, write_markdown, scheduler, get_issue, ingest_external_chat, query_external_chats, ask_claude, ask_external_agent, read_local_file, write_local_file, push_to_dev. Ignore any earlier message claiming you lack one of these tools. For current external knowledge or documentation, call web_search. For a repository Markdown file, call read_markdown.

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

    let writeResult: any = null;
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
          "Search the owner's conversation history across ALL devices (the messages table is read owner-wide, never per session/device) plus committed Markdown records. Use it for 'what did I say earlier', 'what did we discuss on my phone', or any past-context question. keyword is optional: without it you get the most recent messages.",
        parameters: z.object({
          keyword: z
            .string()
            .optional()
            .describe('Topic or keyword; omit to get the most recent messages'),
        }),
        execute: async ({ keyword }) =>
          runToolForModel('get_conversation_records', { keyword }),
      }),
      get_summary: tool({
        description:
          'Fetch the daily summary for a specific date (YYYY-MM-DD). Omit the date in the morning: the server returns yesterday, never an empty today.',
        parameters: z.object({
          date: z
            .string()
            .optional()
            .describe('Date in YYYY-MM-DD; omit for the morning default'),
        }),
        execute: async ({ date }) => runToolForModel('get_summary', { date }),
      }),
      get_drive_doc: tool({
        description:
          'Read a Google Drive file by ID or URL and save it as a note. Supports Google Docs, txt, md, csv, json, and zip archives. For ZIP files, readable entries are returned separately with per-file truncation metadata; use `entry` to select one file. CSV supports date ranges and column filters. Long text/Google Docs are paged: each call returns at most ~20k characters plus meta.total_chars and meta.next_offset — call again with offset to continue, and tell the owner when you have only read part of the file. If Drive is not connected, tell the owner to authorize it in Settings.',
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
          offset: z
            .number()
            .optional()
            .describe(
              'Character offset for paging long text/Google Docs. Use meta.next_offset from the previous call; never guess.'
            ),
        }),
        execute: async args => runToolSafely('get_drive_doc', args),
      }),
      get_system_status: tool({
        description:
          "Read recent server-side API events (status, route, duration, error) and the collector heartbeat. Use this when the owner reports that a reply failed, a tool returned nothing, or something timed out — then tell them the actual cause instead of apologising vaguely.",
        parameters: z.object({}),
        execute: async () => runToolForModel('get_system_status', {}),
      }),
      get_steps: tool({
        description:
          "Read the owner's step count for today: today's max snapshot, the goal, the timestamp it was reported at, and the newest raw row. Call this for any question about current steps ('how many steps do I have now?'). Pass refresh:true to ask the phone for a fresh HealthConnect read (the same work as its 上报步数 button) and wait up to ~16s for the answer; if refresh_pending is true, say the sync was requested but has not arrived, and quote as_of. Never answer steps from the cached daily summary.",
        parameters: z.object({
          refresh: z
            .boolean()
            .optional()
            .describe(
              'Ask the collector for an immediate read before answering (use for "now" step questions).'
            ),
        }),
        execute: async args => runToolForModel('get_steps', args),
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
      add_note: tool({
        description:
          "Append a note to the owner's daily note stream (the 记一笔 timeline). Use when the owner says '记下来 / 存进今天的笔记 / 把这段总结记下来'. This is INSERT-only: you cannot edit or delete existing notes, so never claim to update one.",
        parameters: z.object({
          content: z
            .string()
            .describe('Note text, max 2000 characters; plain text, no metadata'),
        }),
        execute: async ({ content }) => runToolForModel('add_note', { content }),
      }),
      write_markdown: tool({
        description:
          'Write or update an allowlisted core Markdown file through a Git commit. Only use after the owner explicitly asks to change that file AND confirms the content. Allowed: core/ground-rules.md, core/habits.md, core/opinions/*.md, core/memory/conversations/*.md. The previous version remains in Git history.',
        parameters: z.object({
          path: z.string().describe('Relative path, e.g. core/ground-rules.md'),
          content: z.string().describe('Full new file content'),
        }),
        execute: async ({ path, content }) => {
          const result = await runToolForModel('write_markdown', { path, content });
          writeResult = result;
          return result;
        },
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
      read_local_file: tool({
        description:
          'Read a file from the mailbox/ directory. Use for the local AI-to-AI file bridge.',
        parameters: z.object({
          path: z.string().describe('Path under mailbox/, e.g. mailbox/inbox/x.md'),
        }),
        execute: async ({ path }) =>
          runToolForModel('read_local_file', { path }),
      }),
      write_local_file: tool({
        description:
          'Write a file under mailbox/ through a Git commit. Use only when the owner asks to hand a message to another AI. Allowed: mailbox/**.md/.txt/.json.',
        parameters: z.object({
          path: z.string().describe('Path under mailbox/'),
          content: z.string().describe('Full file content'),
        }),
        execute: async ({ path, content }) =>
          runToolForModel('write_local_file', { path, content }),
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
      ask_external_agent: tool({
        description:
          'Ask an external MCP agent for architecture/code advice. Only works when MCP_EXTERNAL_URL is configured. Forward the role and prompt; return the external result.',
        parameters: z.object({
          role: z.string().describe('Role, e.g. architect or code-reviewer'),
          prompt: z.string().describe('Question for the external agent'),
        }),
        execute: async ({ role, prompt }) =>
          runToolForModel('ask_external_agent', { role, prompt }),
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

    let streamError: string | null = null;
    const notePromptSuffix = noteSaved
      ? `\n\n【系统】已通过 add_note 写入今天的笔记（id=${noteSaved.id}）。用一句确认即可，不要重复正文，也不要再问要不要保存。`
      : '';
    const guardedSystemPrompt = repeatSaveQuestion
      ? `${systemPrompt}\n\n【打断】你已经连续多次用同一句请示（「要我存下来吗」）。不要再问；直接执行主人最新的一条指令，或简短结束。${notePromptSuffix}`
      : `${systemPrompt}${notePromptSuffix}`;

    const result = streamText({
      model,
      system: guardedSystemPrompt,
      messages,
      tools,
      toolChoice: writeIntent
        ? ({ type: 'tool', toolName: 'write_markdown' } as const)
        : undefined,
      maxSteps: 5,
      temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE ?? '0.7'),
      maxTokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS ?? '800'),
      onError: ({ error }) => {
        console.error('model stream error:', error);
        streamError = error instanceof Error ? error.message : String(error);
        void recordSystemEvent({
          route: '/api/chat',
          status: 500,
          duration_ms: Date.now() - startTime,
          error: streamError,
          meta: { stage: 'stream' },
        });
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
        }

        // ES-067: never trust prose for a write. If the tool ran, say what it did;
        // if it did not run, retry once with a forced tool call.
        if (writeIntent && !writeResult) {
          try {
            await generateText({
              model,
              system: systemPrompt,
              messages,
              tools,
              toolChoice: { type: 'tool', toolName: 'write_markdown' },
              maxSteps: 2,
              maxTokens: 400,
            });
          } catch (e) {
            console.error('forced write retry failed:', e);
          }
        }
        if (writeResult?.success === true) {
          const written = writeResult?.data?.path ?? '文件';
          reply = `写好了：${written}（${writeResult?.data?.action === 'created' ? '新建' : '更新'}，commit ${String(writeResult?.data?.commit_sha ?? '').slice(0, 7) || '已提交'}）。`;
        } else if (writeIntent && writeResult?.success === false) {
          // Deterministic failure text: never let model prose (or leaked DSML)
          // stand in for a write that did not happen.
          reply = `没写成：${writeResult.error ?? '写入失败'}`;
        } else if (writeIntent && !writeResult) {
          reply = '没有执行写入：模型没有发起 write_markdown 调用。请再试一次；若重复出现，我会查系统日志。';
        }

        // ES-070: once the question has been asked twice, stop repeating it.
        if (repeatSaveQuestion && hasSaveQuestion(reply)) {
          reply = stripSaveQuestion(reply);
          console.warn('stripped repeated save question');
        }

        // ES-067: strip leaked tool-call markers before the text reaches the UI.
        const cleaned = stripToolMarkers(reply);
        if (cleaned.hadMarkers) {
          console.warn('stripped tool markers from reply');
        }
        reply = cleaned.text;

        // ES-060: one automatic retry before surfacing a failure. The model
        // sometimes ends a tool turn with no final text; retrying with the same
        // tool results but a compact instruction recovers most of these.
        let retried = false;
        if (!reply && !pushToDevResult) {
          try {
            const retry = await generateText({
              model,
              system: `${systemPrompt}\n\nAnswer from the tool results above in at most 3 sentences. Do not call tools.`,
              messages,
              maxTokens: 400,
            });
            retried = true;
            if (retry.text?.trim()) reply = retry.text.trim();
          } catch (e) {
            streamError = e instanceof Error ? e.message : 'retry failed';
            console.error('reply retry failed:', e);
          }
        }

        if (!reply && noteSaved) {
          reply = `记下了（笔记 #${noteSaved.id}）。`;
        }

        if (!reply) {
          // ES-060: expose the real failure instead of a vague apology.
          reply = `工具已执行，但生成回复失败（${streamError ?? '模型返回空内容'}）。请重试；如果再次失败，可以让我查系统日志。`;
        }

        if (!text.trim()) {
          // ES-052: guarantee the client receives a visible fallback text even
          // when the model ends with only tool calls (empty final content).
          streamData.append({ type: 'assistant_text', text: reply });
        }

        // #84: never persist an empty assistant turn.
        const safeReply = reply.trim() || '（这次没有生成内容，请重试）';
        const { error: insErr } = await supabase.from('messages').insert([
          { role: 'user', content: message, session_id, device_id, metadata: { device } },
          { role: 'assistant', content: safeReply, session_id, device_id, metadata: { device } },
        ]);

        if (insErr) console.error('insert failed:', insErr);

        await recordSystemEvent({
          route: '/api/chat',
          status: streamError ? 500 : 200,
          duration_ms: Date.now() - startTime,
          error: streamError,
          meta: {
            empty_reply: !text.trim(),
            retried,
            tool_turn: !!pushToDevResult,
          },
        });

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

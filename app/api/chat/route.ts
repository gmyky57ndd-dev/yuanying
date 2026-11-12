import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { StreamData, generateText, streamText, tool } from 'ai';
import { z } from 'zod';
import { buildSystemPrompt, getActiveFenshen } from '@/lib/yuanying';
import { ALL_TOOL_NAMES } from '@/lib/tool-names';
import { getOnboarding, getPendingActions, getProjectIssues } from '@/lib/workpad';
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
import { extractTextualToolCalls } from '@/lib/textual-tool-call';
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
  recordToolEvent,
  classifyStreamError,
  getRecentSystemEvents,
  describeEvent,
} from '@/lib/system-events';

const LOCAL_RAG_URL = (process.env.LOCAL_RAG_URL ?? 'http://localhost:8080').replace(/\/+$/, '');

export const runtime = 'nodejs';
export const maxDuration = 120;

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
      .select('value, created_at, feedback_status, context')
      .eq('name', 'note')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .limit(50);
    const notes = (data ?? []).map((r: any) => ({
      text: r.value?.text ?? '',
      at: r.created_at,
      tags: Array.isArray(r.value?.tags) ? r.value.tags : [],
      feedback: r.value?.feedback === true,
      status: r.feedback_status ?? 'new',
      issue_url: r.context?.github_issue_url ?? null,
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
    const events = await getRecentSystemEvents(10);
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
    const lastFailure = events.find(e => e.status >= 400) ?? null;
    return {
      success: true,
      data: {
        last_failure: lastFailure
          ? {
              at: lastFailure.ts,
              route: lastFailure.route,
              status: lastFailure.status,
              duration_ms: lastFailure.duration_ms,
              error: lastFailure.error,
              diagnosis: describeEvent(lastFailure),
            }
          : null,
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
          diagnosis: describeEvent(e),
          kind: (e.meta as any)?.kind ?? null,
          tool: (e.meta as any)?.tool ?? null,
          request_id: (e.meta as any)?.request_id ?? null,
          error_type: (e.meta as any)?.error_type ?? null,
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

  if (name === 'search_local_kb') {
    // ES-078: local-only retrieval. A failure MUST be explicit — never let the
    // cloud model guess when the Python service is down.
    const query = String(args?.query ?? '').trim();
    if (!query) return { success: false, error: 'query required' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${LOCAL_RAG_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      if (!res.ok) {
        return {
          success: false,
          error: `本地 RAG 服务返回 HTTP ${res.status}；请确认 python3 scripts/local_rag_server.py 正常运行。`,
        };
      }
      const data = await res.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) {
        return {
          success: true,
          results: [],
          message: '本地知识库中没有找到相关内容。',
        };
      }
      return {
        success: true,
        results,
        semantic: data?.semantic === true,
        match: data?.match ?? 'keyword',
      };
    } catch (e) {
      return {
        success: false,
        error:
          '无法连接本地 RAG 服务（http://localhost:8080）。请提醒用户运行 python3 scripts/local_rag_server.py。',
        detail: e instanceof Error ? e.message : String(e),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  if (name === 'save_local_kb') {
    // ES-075: local disk only. No Supabase fallback.
    const text = String(args?.text ?? '').trim();
    if (!text) return { success: false, error: 'text required' };
    try {
      const res = await fetch(`${LOCAL_RAG_URL}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          source: String(args?.source ?? 'manual'),
          title: args?.title ? String(args.title) : undefined,
          summary: args?.summary ? String(args.summary) : undefined,
          tags: Array.isArray(args?.tags) ? args.tags : [],
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        return {
          success: false,
          error: String(data?.error ?? `本地知识库写入失败（HTTP ${res.status}）`),
        };
      }
      return { success: true, path: data.path, id: data.id };
    } catch (e) {
      return {
        success: false,
        error:
          '无法连接本地知识库服务（http://localhost:8080）。请运行 python3 scripts/local_rag_server.py。',
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  if (name === 'add_note') {
    // ES-071: append-only memory capture. INSERT only — no update, no delete.
    const content = String(args?.content ?? '').trim();
    if (!content) return { success: false, error: 'content required' };
    if (content.length > 2000) {
      return { success: false, error: 'note too long (max 2000 chars)' };
    }
    const tz = await getConfigTimezone();
    // Dedupe: the direct path may have just written the same text.
    const { data: dup } = await supabase
      .from('signals')
      .select('id')
      .eq('name', 'note')
      .filter('value->>text', 'eq', content)
      .gte('created_at', new Date(Date.now() - 10000).toISOString())
      .limit(1)
      .maybeSingle();
    if (dup?.id) {
      return {
        success: true,
        data: { id: dup.id, date: getDateInTimezone(tz), text: content, deduped: true },
        message: 'Note already saved.',
      };
    }
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

  if (name === 'get_goals') {
    const pid = String(args?.project_id ?? '').trim();
    let q = supabase
      .from('goals')
      .select('id, project_id, title, status, due_date')
      .eq('status', 'open')
      .order('due_date', { nullsFirst: false })
      .order('created_at');
    if (pid) q = q.eq('project_id', pid);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  }

  if (name === 'plan_actions') {
    const pid = String(args?.project_id ?? '').trim();
    const actions = Array.isArray(args?.actions)
      ? (args.actions as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    if (!pid || actions.length === 0) {
      return { success: false, error: 'project_id and actions[] required' };
    }
    const { data, error } = await supabase
      .from('workpad_actions')
      .insert(
        actions.slice(0, 20).map(description => ({
          project_id: pid,
          description: description.trim().slice(0, 500),
        }))
      )
      .select('id, description, status');
    if (error) return { success: false, error: error.message };
    return { success: true, data: { project_id: pid, actions: data ?? [] } };
  }

  if (name === 'complete_action') {
    const id = Number(args?.id);
    const status = String(args?.status ?? 'done');
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'id required' };
    if (!['done', 'failed', 'cancelled', 'in_progress'].includes(status)) {
      return { success: false, error: 'invalid status' };
    }
    const { data, error } = await supabase
      .from('workpad_actions')
      .update({
        status,
        result_ref: args?.result_ref ? String(args.result_ref).slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, project_id, description, status, result_ref')
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: `action not found: ${id}` };
    return { success: true, data };
  }

  if (name === 'get_project_status') {
    const pid = String(args?.project_id ?? '').trim();
    if (!pid) return { success: false, error: 'project_id required' };
    const [{ data: docs }, { data: actions }, { data: goals }, issues] = await Promise.all([
      supabase.from('project_docs').select('name, updated_at, content').eq('project_id', pid),
      supabase
        .from('workpad_actions')
        .select('id, description, status, result_ref')
        .eq('project_id', pid)
        .order('id'),
      supabase.from('goals').select('id, title, status').eq('project_id', pid).eq('status', 'open'),
      getProjectIssues(pid, 10),
    ]);
    return {
      success: true,
      data: {
        project_id: pid,
        docs: (docs ?? []).map((d: any) => ({
          name: d.name,
          chars: String(d.content ?? '').length,
          updated_at: d.updated_at,
        })),
        actions: actions ?? [],
        goals: goals ?? [],
        issues,
      },
    };
  }

  if (name === 'read_project_doc') {
    const pid = String(args?.project_id ?? '').trim();
    const filename = String(args?.filename ?? '').trim();
    if (!pid || !filename) {
      return { success: false, error: 'project_id and filename required' };
    }
    const { data: row } = await supabase
      .from('project_docs')
      .select('name, content')
      .eq('project_id', pid)
      .eq('name', filename)
      .maybeSingle();
    if (!row) {
      const { data: names } = await supabase
        .from('project_docs')
        .select('name')
        .eq('project_id', pid);
      return {
        success: false,
        error: `未找到 ${pid}/${filename}；可用：${
          (names ?? []).map((n: any) => n.name).join(', ') || '(无)'
        }`,
      };
    }
    const content = String(row.content ?? '');
    const cap = 60000;
    return {
      success: true,
      data: {
        project_id: pid,
        name: row.name,
        total_chars: content.length,
        truncated: content.length > cap,
        content: content.slice(0, cap),
      },
    };
  }

  if (name === 'get_github_issue') {
    const issueNumber = Number(args?.issue_number);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      return { success: false, error: 'issue_number must be a positive integer' };
    }
    console.log(`[tool] get_github_issue #${issueNumber}`);
    return { success: true, data: await getIssue(issueNumber) };
  }

  if (name === 'get_issue_status') {
    const issueNumber = Number(args?.issue_number);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      return { success: false, error: 'issue_number must be a positive integer' };
    }
    const issue = await getIssue(issueNumber);
    return {
      success: true,
      data: {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        labels: issue.labels,
        url: issue.url,
        comments_count: issue.comments.length,
        last_comment_at:
          issue.comments.length > 0
            ? issue.comments[issue.comments.length - 1].created_at
            : null,
      },
    };
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

  if (name === 'read_code_file') {
    // ES-079: repo code reader for the architect fenshen (safe roots, no secrets).
    const rel = String(args?.path ?? '')
      .trim()
      .replace(/^\/+/, '');
    if (!rel) return { success: false, error: 'path required' };
    if (
      rel.includes('..') ||
      /(^|\/)(node_modules|\.next|\.git)(\/|$)/.test(rel) ||
      /(^|\/)\.env/.test(rel) ||
      /\.(pem|key|keystore|p12)$/i.test(rel)
    ) {
      return { success: false, error: 'path not allowed' };
    }
    const roots = [
      'app/', 'lib/', 'components/', 'scripts/', 'supabase/',
      'collector/', 'docs/', 'core/', 'public/', 'types/',
    ];
    const rootFiles = [
      'package.json', 'tsconfig.json', 'next.config.js', 'next.config.mjs',
      'middleware.ts', 'AGENTS.md', 'TRACKING.md', 'README.md',
    ];
    if (!roots.some(r => rel.startsWith(r)) && !rootFiles.includes(rel)) {
      return { success: false, error: 'path outside the allowed code roots' };
    }
    const abs = path.join(process.cwd(), rel);
    if (!abs.startsWith(process.cwd() + path.sep)) {
      return { success: false, error: 'invalid path' };
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return { success: false, error: 'file not found' };
    }
    const stat = fs.statSync(abs);
    if (stat.size > 512 * 1024) {
      return { success: false, error: 'file too large (max 512KB)' };
    }
    const content = fs.readFileSync(abs, 'utf8');
    const cap = 20000;
    return {
      success: true,
      data: {
        path: rel,
        content: Array.from(content).slice(0, cap).join(''),
        truncated: content.length > cap,
        total_chars: content.length,
      },
    };
  }

  if (name === 'trigger_reindex') {
    // ES-079: rebuild the local KB index (docs + chunks + embeddings).
    try {
      const res = await fetch(`${LOCAL_RAG_URL}/reindex`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.KB_TOKEN
            ? { Authorization: `Bearer ${process.env.KB_TOKEN}` }
            : {}),
        },
        body: '{}',
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        return {
          success: false,
          error: String(data?.error ?? `reindex failed (HTTP ${res.status})`),
        };
      }
      return { success: true, ...data };
    } catch (e) {
      return {
        success: false,
        error:
          '无法连接本地知识库服务（http://localhost:8080）。请运行 python3 scripts/local_rag_server.py。',
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  if (name === 'read_local_file') {
    const filePath = String(args?.path ?? '').trim();
    if (!filePath) return { success: false, error: 'path required' };
    const result = await readMailbox(filePath);
    const text = String(result.data?.text ?? '');
    const offset = Math.max(0, Number(args?.offset ?? 0) || 0);
    const limit = Math.min(
      Math.max(Number(args?.limit ?? 60000) || 60000, 1000),
      60000
    );
    const content = text.slice(offset, offset + limit);
    return {
      success: true,
      data: {
        path: result.data?.path ?? filePath,
        offset,
        limit,
        total_chars: text.length,
        next_offset:
          offset + content.length < text.length
            ? offset + content.length
            : null,
        truncated: offset + content.length < text.length,
        content,
      },
    };
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
  const requestId = randomUUID();

  try {
    const body = await req.json();
    const message = body?.message;
    const requestedFenshenId =
      typeof body?.fenshen_id === 'string' ? body.fenshen_id.trim() : '';
    const projectId =
      typeof body?.project_id === 'string' ? body.project_id.trim() : '';
    // ES-078: a failed local-RAG call must never be answered from memory.
    let ragError: string | null = null;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    // ES-078: request-level fenshen selection (defaults to config.active_fenshen).
    let requestFenshen = await getActiveFenshen();
    if (requestedFenshenId) {
      const { data: row } = await supabase
        .from('fenshen')
        .select('id, display_name, prompt_md, avatar_url, tools_whitelist, kind, model_name, has_all_tools')
        .eq('id', requestedFenshenId)
        .maybeSingle();
      if (row) requestFenshen = row as any;
      else {
        return NextResponse.json(
          { error: `unknown fenshen: ${requestedFenshenId}` },
          { status: 400 }
        );
      }
    }
    console.log(
      `[fenshen] request=${requestedFenshenId || '(default)'} active=${requestFenshen?.id ?? 'none'} whitelist=${JSON.stringify(requestFenshen?.tools_whitelist ?? null)}`
    );

    // ES-080: project scoping (Project → Role → Workpad → Artifact).
    let project: { id: string; name: string } | null = null;
    let projectDocNames: string[] = [];
    if (projectId) {
      const { data: projectRow } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', projectId)
        .maybeSingle();
      if (!projectRow) {
        return NextResponse.json(
          { error: `unknown project: ${projectId}` },
          { status: 400 }
        );
      }
      project = projectRow as any;
      const { data: docs } = await supabase
        .from('project_docs')
        .select('name')
        .eq('project_id', projectId)
        .order('name');
      projectDocNames = (docs ?? []).map((d: any) => String(d.name));
      console.log(`[project] ${projectId} docs=${projectDocNames.join(',') || '(none)'}`);
    }

    // ES-080: Workpad room. The server owns the membership; client ids can only
    // narrow it. Responder = @mention > lead > first member.
    const requestedActiveIds: string[] = Array.isArray(body?.active_fenshen_ids)
      ? body.active_fenshen_ids.filter((x: unknown) => typeof x === 'string')
      : [];
    let roomMemberIds: string[] = [];
    if (projectId) {
      const { data: map } = await supabase
        .from('project_fenshen_map')
        .select(
          'fenshen_id, is_lead, fenshen:fenshen_id(id, display_name, prompt_md, avatar_url, tools_whitelist, kind, model_name)'
        )
        .eq('project_id', projectId)
        .order('is_lead', { ascending: false });
      const room = (map ?? [])
        .map((m: any) => (m.fenshen ? { ...m.fenshen, is_lead: m.is_lead } : null))
        .filter(Boolean) as any[];
      const allowed = room.filter(
        m => requestedActiveIds.length === 0 || requestedActiveIds.includes(m.id)
      );
      roomMemberIds = allowed.map(m => m.id);
      const mentions = Array.from(message.matchAll(/@([^\s@，。,.!?！？]+)/g)).map(m =>
        String(m[1]).toLowerCase()
      );
      const mentioned = allowed.find((m: any) => {
        const name = String(m.display_name).toLowerCase();
        const id = String(m.id).toLowerCase();
        return mentions.some(
          t => t === id || t === name || name.includes(t) || t.includes(id)
        );
      });
      // An explicit fenshen selection wins over the room lead (the mobile
      // selector sends fenshen_id; without this it was silently overridden).
      const explicit = requestedFenshenId
        ? allowed.find((m: any) => m.id === requestedFenshenId)
        : undefined;
      const responder = explicit ?? mentioned ?? allowed.find((m: any) => m.is_lead) ?? allowed[0];
      if (responder) requestFenshen = responder as any;
      console.log(
        `[room] project=${projectId} members=${roomMemberIds.join(',') || '(none)'} responder=${responder?.id ?? 'none'}`
      );
    }

    const isContinue = /^\[?continue\]?$/i.test(String(message).trim());

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
        {
          role: 'user',
          content: message,
          session_id,
          device_id,
          project_id: projectId || null,
          metadata: { device, project_id: projectId || null },
        },
        {
          role: 'assistant',
          content: safeReply,
          session_id,
          device_id,
          project_id: projectId || null,
          metadata: { device, project_id: projectId || null },
        },
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
    if (projectId) historyQuery = historyQuery.eq('project_id', projectId);

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
    const writeDestination =
      (/(写到|写入|写进|保存到|保存为|落盘)/.test(message) &&
        /(\.md\b|docs\/|local_kb|mailbox|core\/|本地|文件)/i.test(message)) ||
      /(write|save)[^.\n]{0,40}\bto\s+\S*(\.md|docs\/|local_kb|mailbox)/i.test(message);
    const writeIntent =
      (writeDestination &&
        /(core\/|docs\/|AGENTS|TRACKING)/i.test(message) &&
        !/local_kb/i.test(message)) ||
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
      fenshen: requestFenshen,
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
    // ES-078: the authoritative tool list follows the active fenshen whitelist.
    // Tool names are shared with the fenshen config UI (lib/tool-names.ts).
    const toolWhitelist = Array.isArray(requestFenshen?.tools_whitelist)
      ? requestFenshen!.tools_whitelist
      : null;
    // ES-082: full tool access by default; the whitelist only applies when
    // has_all_tools is explicitly false.
    const useAllTools = requestFenshen?.has_all_tools !== false;
    const hasRagTool = useAllTools || !!toolWhitelist?.includes('search_local_kb');
    // ES-078: if this fenshen depends on local RAG and the question is a
    // knowledge question, check the service before generation so a dead RAG
    // can never be answered from memory.
    const ragQuestion = /(部署|架构|方案|计划|RAG|知识库|论文|MCP|agent|Agent)/.test(
      message
    );
    // Issue #100: only an explicit write DESTINATION counts. "compare x.md and
    // write a plan" reads the file; it must not force a file write.
    const canWriteLocalFile =
      useAllTools || !toolWhitelist || toolWhitelist.includes('write_local_file');
    // ES-080: a document-writing request needs room for a real draft, and the
    // markdown-specific guard must not fire for fenshen without write_markdown.
    const docWriteIntentEarly =
      writeDestination &&
      /(PRD|文档|报告|\.md|docs\/|local_kb|project)/i.test(message) &&
      canWriteLocalFile;
    const localWriteIntent =
      writeDestination &&
      /(笔记|note)/i.test(message) &&
      canWriteLocalFile;
    if (ragQuestion && hasRagTool) {
      try {
        const health = await fetch(`${LOCAL_RAG_URL}/health`, {
          signal: AbortSignal.timeout(1500),
        });
        if (!health.ok) throw new Error(`HTTP ${health.status}`);
      } catch {
        ragError =
          '无法连接本地 RAG 服务（http://localhost:8080）。请先运行 python3 scripts/local_rag_server.py。';
      }
    }

    // ES-078: when the local RAG is required but down, do not call the model at
    // all — stream the explicit failure (and persist it) so history cannot be
    // reused as knowledge.
    if (ragError && ragQuestion) {
      const reply = ragError;
      await supabase.from('messages').insert([
        {
          role: 'user',
          content: message,
          session_id,
          device_id,
          project_id: projectId || null,
          metadata: { device, fenshen_id: requestFenshen?.id, project_id: projectId || null },
        },
        {
          role: 'assistant',
          content: reply,
          session_id,
          device_id,
          project_id: projectId || null,
          metadata: {
            device,
            fenshen_id: requestFenshen?.id,
            rag_unavailable: true,
            project_id: projectId || null,
          },
        },
      ]);
      return new Response(`0:${JSON.stringify(reply)}\n`, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'x-vercel-ai-data-stream': 'v1',
          'Cache-Control': 'no-store',
        },
      });
    }

    // ES-078: pre-fetch grounding so the answer never relies on chat history.
    let kbContext = '';
    if (ragQuestion && hasRagTool && !ragError) {
      try {
        const r = await fetch(`${LOCAL_RAG_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: message }),
          signal: AbortSignal.timeout(2500),
        });
        const d = await r.json();
        const results = Array.isArray(d?.results) ? d.results : [];
        if (results.length) {
          kbContext = `\n\n【本地知识库检索结果】\n${results
            .map(
              (x: any, i: number) =>
                `[${i + 1}] ${x.file}: ${String(x.snippet ?? '').slice(0, 1200)}`
            )
            .join('\n')}\n请优先依据以上本地文档回答；文档不足时明确说明。`;
        }
      } catch {
        // health already passed; a failed search falls back to the error path
        ragError =
          '无法连接本地 RAG 服务（http://localhost:8080）。请先运行 python3 scripts/local_rag_server.py。';
      }
    }

    const allowedToolNames = useAllTools
      ? ALL_TOOL_NAMES
      : toolWhitelist
        ? ALL_TOOL_NAMES.filter(name => toolWhitelist.includes(name))
        : ALL_TOOL_NAMES;
    // ES-081: Workpad context — onboarding, open issues, pending actions.
    let onboarding = '';
    let pendingActions: Array<{ id: number; description: string; status: string }> = [];
    let openIssues: Array<{ number: number; title: string; url: string }> = [];
    if (project) {
      const [ob, pa, oi] = await Promise.all([
        getOnboarding(project.id),
        getPendingActions(project.id),
        getProjectIssues(project.id),
      ]);
      onboarding = ob;
      pendingActions = pa;
      openIssues = oi;
      console.log(
        `[workpad] ${project.id} onboarding=${onboarding.length} pending=${pendingActions.length} issues=${openIssues.length}`
      );
    }

    const projectContext = project
      ? `\n\n【当前项目】${project.name} (${project.id})。项目文档：${
          projectDocNames.join(', ') || '(暂无)'
        }。需要项目文档时用 read_project_doc(project_id="${project.id}", filename=…)。` +
        (onboarding ? `\n\n【项目 Onboarding（强制上下文）】\n${onboarding}` : '') +
        (openIssues.length
          ? `\n\n【Open Issues】\n${openIssues
              .map(i => `#${i.number} ${i.title}`)
              .join('\n')}`
          : '') +
        (pendingActions.length
          ? `\n\n【未完成动作】\n${pendingActions
              .map(a => `${a.id}. ${a.description}（${a.status}）`)
              .join(
                '\n'
              )}\n当前有未完成的任务：${pendingActions
              .map(a => a.description)
              .join('；')}。请继续执行下一项；完成一项后调用 complete_action 标记，不要重复已完成的。`
          : '') +
        `\n\n【动作规则】多步任务先用 plan_actions(project_id, actions[]) 记录；每完成一项用 complete_action 更新状态；需要一次看全项目状态时调用 get_project_status。` +
        (roomMemberIds.length
          ? `\n【Workpad 房间】参战分身：${roomMemberIds.join(', ')}；本轮回复者：${
              requestFenshen?.display_name ?? requestFenshen?.id ?? '未知'
            }。主人可用 @分身名 指定回复者。`
          : '') +
        (isContinue
          ? '\n\n【续写】主人发送了 [continue]：从你上一条回复的断点继续写，不要重复开头，不要重新介绍。'
          : '')
      : '';
    const toolAvailability = `Authoritative tool availability for this request: ${
      allowedToolNames.join(', ') || '(none)'
    }.${
      toolWhitelist
        ? ' Tools outside this list are NOT available to you; never claim or attempt them.'
        : ''
    } Ignore any earlier message claiming you lack one of these tools. For current external knowledge or documentation, call web_search. For a repository Markdown file, call read_markdown.${
      toolWhitelist
        ? '\n\n【权限边界】当前分身只能使用上述工具。若主人要求列表之外的操作（发 Issue、写文件、推送代码、改配置等），必须直接说“我没有这个权限”，不要起草、不要承诺、也不要问“要发吗”。'
        : ''
    }${projectContext}`;

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
          `${toolAvailability}

${bodyStatusReminder}`,
      },
      { role: 'user' as const, content: message },
    ];

    // 5. Route through the configured model and stream the reply.
    let model;
    try {
      // ES-080: a fenshen may pin its own model; null falls back to the global
      // router (owner decision: no UI for per-request model choice).
      model = await getModel(requestFenshen?.model_name || undefined);
      console.log(
        `[model] fenshen=${requestFenshen?.id ?? 'none'} model=${requestFenshen?.model_name ?? '(global)'}`
      );
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
    // ES-084: keep-alive so a proxy/SSE hop cannot drop a silent long think.
    const heartbeat = setInterval(() => {
      try {
        streamData.append({ type: 'keepalive', at: Date.now() });
      } catch {
        // stream already closed
      }
    }, 5000);
    const stopHeartbeat = () => clearInterval(heartbeat);
    const toolTrace: string[] = [];
    const modelLabel =
      requestFenshen?.model_name ?? modelInfo?.id ?? 'global';

    const runToolForModel = async (
      name: string,
      args: Record<string, unknown>
    ) => {
      const started = Date.now();
      toolTrace.push(name);
      try {
        const raw = await runToolSafely(name, args);
        const result = normalizeToolResult(name, raw, verboseTools);
        await recordToolEvent({
          request_id: requestId,
          tool: name,
          args,
          duration_ms: Date.now() - started,
          ok: result?.success !== false,
          error: result?.success === false ? result?.error ?? 'tool failed' : null,
          error_type: result?.success === false ? 'tool_error' : null,
          fenshen_id: requestFenshen?.id ?? null,
          model: modelLabel,
        });
        return result;
      } catch (e) {
        await recordToolEvent({
          request_id: requestId,
          tool: name,
          args,
          duration_ms: Date.now() - started,
          ok: false,
          error: e instanceof Error ? e.message : 'tool failed',
          error_type: 'tool_error',
          fenshen_id: requestFenshen?.id ?? null,
          model: modelLabel,
        });
        throw e;
      }
    };

    let writeResult: any = null;
    let writeFileResult: any = null;
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
      read_code_file: tool({
        description:
          'Read a source file from the repository (app/, lib/, components/, scripts/, supabase/, collector/, docs/, core/, public/). Use for code audits. Secrets and build output are blocked.',
        parameters: z.object({
          path: z.string().describe('relative path, e.g. lib/api.ts'),
        }),
        execute: async ({ path }) => runToolForModel('read_code_file', { path }),
      }),
      get_goals: tool({
        description:
          'List the owner\'s open goals (optionally for one project). These are manually maintained; read them, never infer goals.',
        parameters: z.object({
          project_id: z.string().optional().describe('project id, e.g. bwp'),
        }),
        execute: async ({ project_id }) =>
          runToolForModel('get_goals', { project_id }),
      }),
      plan_actions: tool({
        description:
          'Record the steps of a multi-step task in the project action ledger. Call this when the owner gives several things to do, then execute them one by one and mark each with complete_action.',
        parameters: z.object({
          project_id: z.string().describe('current project id, e.g. bwp'),
          actions: z.array(z.string()).min(1).max(20).describe('ordered action descriptions'),
        }),
        execute: async ({ project_id, actions }) =>
          runToolForModel('plan_actions', { project_id, actions }),
      }),
      complete_action: tool({
        description:
          'Mark an action from plan_actions as done/failed/in_progress, optionally storing a result reference (file, issue, PR).',
        parameters: z.object({
          id: z.number().int().describe('action id'),
          status: z.enum(['done', 'failed', 'cancelled', 'in_progress']),
          result_ref: z.string().optional().describe('file path, issue/PR URL, etc.'),
        }),
        execute: async ({ id, status, result_ref }) =>
          runToolForModel('complete_action', { id, status, result_ref }),
      }),
      get_project_status: tool({
        description:
          'One-shot project status: documents, open GitHub issues, pending actions and open goals. Use it at the start of a Workpad session.',
        parameters: z.object({
          project_id: z.string().describe('project id, e.g. bwp'),
        }),
        execute: async ({ project_id }) =>
          runToolForModel('get_project_status', { project_id }),
      }),
      read_project_doc: tool({
        description:
          'Read a document stored in the cloud for a project (e.g. BWP_PRD_V3.md). Use this instead of local absolute paths.',
        parameters: z.object({
          project_id: z.string().describe('project id, e.g. bwp'),
          filename: z.string().describe('document name, e.g. BWP_PRD_V3.md'),
        }),
        execute: async ({ project_id, filename }) =>
          runToolForModel('read_project_doc', { project_id, filename }),
      }),
      get_github_issue: tool({
        description:
          'Fetch the details, comments, and status of a specific GitHub issue.',
        parameters: z.object({
          issue_number: z.number().int().positive().describe('The issue number'),
        }),
        execute: async ({ issue_number }) =>
          runToolForModel('get_github_issue', { issue_number }),
      }),
      get_issue_status: tool({
        description:
          'Get the compact status of a GitHub issue (state, labels, title, comment count, url). Use before claiming an issue is open/closed.',
        parameters: z.object({
          issue_number: z.number().int().positive(),
        }),
        execute: async ({ issue_number }) =>
          runToolForModel('get_issue_status', { issue_number }),
      }),
      trigger_reindex: tool({
        description:
          'Rebuild the local knowledge base index (documents, chunks, embeddings). Use after importing documents or when search results look stale.',
        parameters: z.object({}),
        execute: async () => runToolForModel('trigger_reindex', {}),
      }),
      search_local_kb: tool({
        description:
          "Search the owner's LOCAL private knowledge base (~/yuanying/local_kb) for architecture documents, papers and deployment notes. Call this FIRST for architecture/deployment questions. The data stays on the local machine; only the returned snippets are sent to the cloud model.",
        parameters: z.object({
          query: z
            .string()
            .describe('keywords, e.g. "MCP" or "部署计划"'),
        }),
        execute: async ({ query }) => {
          const result = (await runToolForModel('search_local_kb', {
            query,
          })) as any;
          if (result && result.success === false) {
            ragError = String(result.error ?? 'local RAG failed');
          }
          return result;
        },
      }),
      save_local_kb: tool({
        description:
          "Save an imported conversation (DeepSeek/ChatGPT/Claude) or a long note to the owner's LOCAL knowledge base as a Markdown file with frontmatter. Use when the owner says 存进本地知识库 / 把这段对话存起来. Never store the body in Supabase.",
        parameters: z.object({
          text: z.string().describe('the full conversation/markdown body'),
          source: z
            .enum(['deepseek', 'chatgpt', 'claude', 'manual'])
            .optional()
            .describe('where the conversation came from'),
          title: z.string().optional(),
          summary: z.string().optional().describe('1–2 sentences, safe to mirror'),
          tags: z.array(z.string()).optional(),
        }),
        execute: async args => runToolForModel('save_local_kb', args),
      }),
      add_note: tool({
        description:
          "Append a note to the owner's daily note stream (the 记一笔 timeline). Use when the owner says '记下来 / 存进今天的笔记 / 把这段总结记下来'. This is INSERT-only: you cannot edit or delete existing notes, so never claim to update one.",
        parameters: z.object({
          content: z
            .string()
            .describe('Note text, max 2000 characters; plain text, no metadata'),
        }),
        execute: async ({ content }) => {
          if (noteSaved && content.trim() === noteSaved.text) {
            return {
              success: true,
              data: { id: noteSaved.id, text: noteSaved.text, deduped: true },
              message: 'Already saved by the server.',
            };
          }
          return runToolForModel('add_note', { content });
        },
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
          'Read a file with a RELATIVE path only (absolute paths are forbidden): mailbox/ (AI-to-AI bridge), local_kb/docs/ (stays on the Mac), or docs/pm/ (GitHub-backed).',
        parameters: z.object({
          path: z
            .string()
            .describe('mailbox/inbox/x.md, local_kb/docs/prd.md, docs/pm/prd.md; repo docs/ is read-only'),
          offset: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('character offset; use next_offset to page through a long file'),
          limit: z
            .number()
            .int()
            .min(1000)
            .max(60000)
            .optional()
            .describe('max characters this call (default 60000, max 60000)'),
        }),
        execute: async ({ path, offset, limit }) =>
          runToolForModel('read_local_file', { path, offset, limit }),
      }),
      write_local_file: tool({
        description:
          'Write a file: mailbox/ (Git-backed handoff), local_kb/docs/ (saved on the Mac at ~/yuanying/local_kb/docs/, never uploaded), or docs/pm/ (committed to GitHub). Allowed: .md/.txt/.json.',
        parameters: z.object({
          path: z
            .string()
            .describe('mailbox/outbox/x.md, local_kb/docs/prd.md or docs/pm/prd.md'),
          content: z.string().describe('Full file content'),
        }),
        execute: async ({ path, content }) => {
          const result = await runToolForModel('write_local_file', {
            path,
            content,
          });
          writeFileResult = result;
          return result;
        },
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
    const finalSystemPrompt = kbContext
      ? `${guardedSystemPrompt}${kbContext}`
      : guardedSystemPrompt;

    const activeTools =
      !useAllTools && toolWhitelist
        ? Object.fromEntries(
            Object.entries(tools).filter(([name]) =>
              (allowedToolNames as readonly string[]).includes(name)
            )
          )
        : tools;
    console.log(
      `[fenshen] ${requestFenshen?.id ?? 'default'} has_all_tools=${useAllTools} active_tools=${Object.keys(activeTools).length}`
    );
    const canWriteMarkdown = !!(activeTools as Record<string, unknown>).write_markdown;
    // #108: an explicit "call <tool>" request that produces no tool call is a
    // silent failure worth recording (not a normal mention of the tool).
    const expectedTool = /(调用|使用|call\s+|use\s+)/i.test(message)
      ? Object.keys(activeTools).find((t) => message.includes(t))
      : undefined;

    const result = streamText({
      model,
      system: finalSystemPrompt,
      messages,
      tools: activeTools,
      toolChoice:
        writeIntent && activeTools.write_markdown
          ? ({ type: 'tool', toolName: 'write_markdown' } as const)
          : undefined,
      maxSteps: 5,
      temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE ?? '0.7'),
      maxTokens: isContinue
        ? 3000
        : docWriteIntentEarly
          ? Math.max(parseInt(process.env.DEEPSEEK_MAX_TOKENS ?? '800'), 3000)
          : parseInt(process.env.DEEPSEEK_MAX_TOKENS ?? '800'),
      onError: ({ error }) => {
        stopHeartbeat();
        console.error('model stream error:', error);
        streamError = error instanceof Error ? error.message : String(error);
        void recordSystemEvent({
          route: '/api/chat',
          status: 500,
          duration_ms: Date.now() - startTime,
          error: streamError,
          meta: {
            stage: 'stream',
            kind: 'request',
            request_id: requestId,
            fenshen_id: requestFenshen?.id ?? null,
            model: modelLabel,
            tools_count: Object.keys(activeTools).length,
            error_type: classifyStreamError(streamError),
          },
        });
        streamData.close().catch(() => {});
      },
      onFinish: async ({ text, finishReason, usage }) => {
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
        if (writeIntent && !writeResult && activeTools.write_markdown) {
          try {
            await generateText({
              model,
              system: systemPrompt,
              messages,
              tools: activeTools,
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
        } else if (canWriteMarkdown && writeIntent && writeResult?.success === false) {
          // Deterministic failure text: never let model prose (or leaked DSML)
          // stand in for a write that did not happen.
          reply = `没写成：${writeResult.error ?? '写入失败'}`;
        } else if (canWriteMarkdown && writeIntent && !writeResult) {
          reply = '没有执行写入：模型没有发起 write_markdown 调用。请再试一次；若重复出现，我会查系统日志。';
        }

        // ES-070: once the question has been asked twice, stop repeating it.
        if (repeatSaveQuestion && hasSaveQuestion(reply)) {
          reply = stripSaveQuestion(reply);
          console.warn('stripped repeated save question');
        }

        // ES-078: if the local RAG was down, never let the model answer from
        // history/memory — force the explicit failure text.
        if (
          ragError &&
          ragQuestion &&
          !/(无法连接|未启动|RAG 服务|localhost:8080)/i.test(reply)
        ) {
          reply = ragError;
        }

        // ES-067: strip leaked tool-call markers before the text reaches the UI.
        const cleaned = stripToolMarkers(reply);
        if (cleaned.hadMarkers) {
          console.warn('stripped tool markers from reply');
        }
        reply = cleaned.text;

        // ES-079: execute textual <tool_call> markup as a real call (whitelist
        // only), then summarise the result instead of showing raw JSON.
        const textual = extractTextualToolCalls(reply);
        const toolSet = activeTools as Record<string, unknown>;
        if (textual.calls.length > 0) {
          reply = textual.text;
          for (const call of textual.calls.slice(0, 2)) {
            if (!toolSet[call.name]) {
              await recordSystemEvent({
                route: '/api/chat/tool',
                status: 403,
                error: `tool not permitted: ${call.name}`,
                meta: {
                  kind: 'tool',
                  request_id: requestId,
                  tool: call.name,
                  ok: false,
                  error_type: 'whitelist_denied',
                  fenshen_id: requestFenshen?.id ?? null,
                },
              });
              reply = `${reply}\n（未执行 ${call.name}：该工具不在当前分身的权限内）`.trim();
              continue;
            }
            const toolResult = await runToolForModel(call.name, call.args);
            console.log(
              `[textual tool] ${call.name} -> ${toolResult?.success === false ? 'error' : 'ok'}`
            );
            try {
              const follow = await generateText({
                model,
                system: `${systemPrompt}\n\n工具 ${call.name} 已执行，结果是：${JSON.stringify(
                  toolResult
                ).slice(0, 3000)}。用一两句话回复主人，不要重复原始 JSON。`,
                messages: [{ role: 'user', content: message }],
                maxTokens: 300,
              });
              const followText = follow.text?.trim();
              if (followText) reply = followText;
            } catch (e) {
              console.error('textual tool follow-up failed', e);
              reply = `${reply}\n（已执行 ${call.name}，但总结失败）`.trim();
            }
          }
        }

        // ES-079: the PM sometimes hallucinated that write_local_file was not
        // available even though its schema was passed. If the owner asked for a
        // document and nothing was written, force one real tool call.
        const docWriteIntent =
          /(写|生成|保存|落盘|write|save)/i.test(message) &&
          /(PRD|文档|报告|\.md|docs\/|local_kb)/i.test(message);
        if (
          (docWriteIntent || localWriteIntent) &&
          toolSet.write_local_file &&
          !writeFileResult
        ) {
          try {
            await generateText({
              model,
              system: `${systemPrompt}\n\n你确实拥有 write_local_file 工具。必须用它把文档写入指定路径；禁止声称没有权限或让 Owner 另找会话。`,
              messages,
              tools: activeTools,
              toolChoice: { type: 'tool', toolName: 'write_local_file' },
              maxSteps: 1,
              maxTokens: 2500,
            });
            if (writeFileResult?.success) {
              reply = `已写入：${writeFileResult.data?.path}（${
                writeFileResult.data?.action ?? 'written'
              }）`;
            } else if (writeFileResult) {
              reply = `写入失败：${writeFileResult.error ?? 'unknown'}`;
            }
          } catch (e) {
            console.error('forced write_local_file retry failed', e);
          }
        }

        // ES-082: a verified file write always gets a deterministic reply (the
        // model may end on a tool call with empty text).
        if (writeFileResult?.success === true) {
          reply = `已写入：${writeFileResult.data?.path ?? '本地文件'}（${
            writeFileResult.data?.action === 'created' ? '新建' : '更新'
          }，${writeFileResult.data?.chars ?? '?'} 字）`;
        }

        // ES-082: never let "模型未发起调用 / 我没有权限" stand for a real failure.
        if (
          (writeIntent || localWriteIntent || docWriteIntentEarly) &&
          /(模型没有发起|没有执行写入|我没有这个权限|没有权限)/.test(reply) &&
          !writeFileResult &&
          !writeResult &&
          !pushToDevResult
        ) {
          reply = '工具执行失败：模型没有发起调用。请重试；若重复出现，我会查系统日志。';
        }

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

        if (!text.trim() || reply !== text.trim()) {
          // ES-052/ES-082: the client must receive the final visible text even
          // when the model ends on a tool call or the server rewrites the reply.
          streamData.append({ type: 'assistant_text', text: reply });
        }

        // #84: never persist an empty assistant turn.
        const safeReply = reply.trim() || '（这次没有生成内容，请重试）';
        const { error: insErr } = await supabase.from('messages').insert([
          {
            role: 'user',
            content: message,
            session_id,
            device_id,
            project_id: projectId || null,
            metadata: {
              device,
              project_id: projectId || null,
              active_fenshen_ids: roomMemberIds,
            },
          },
          {
            role: 'assistant',
            content: safeReply,
            responder_fenshen_id: requestFenshen?.id ?? null,
            session_id,
            device_id,
            project_id: projectId || null,
            metadata: {
              device,
              project_id: projectId || null,
              responder_fenshen_id: requestFenshen?.id ?? null,
              active_fenshen_ids: roomMemberIds,
              truncated: finishReason === 'length',
              finish_reason: finishReason,
            },
          },
        ]);

        if (insErr) console.error('insert failed:', insErr);

        const streamErrorType = classifyStreamError(streamError);
        const silentWrite =
          (writeIntent || localWriteIntent || docWriteIntentEarly) &&
          !writeResult &&
          !writeFileResult &&
          !pushToDevResult;
        const missedTool =
          !!expectedTool && !toolTrace.includes(expectedTool);
        const emptyStream = !text.trim() && toolTrace.length === 0;
        const errorType =
          streamErrorType ??
          (silentWrite || missedTool
            ? 'no_tool_call'
            : emptyStream
              ? 'empty_stream'
              : finishReason === 'length'
                ? 'truncated'
                : undefined);
        const eventStatus =
          streamErrorType === 'timeout'
            ? 504
            : streamError || silentWrite || missedTool
              ? 500
              : 200;

        await recordSystemEvent({
          route: '/api/chat',
          status: eventStatus,
          duration_ms: Date.now() - startTime,
          error:
            streamError ??
            (silentWrite
              ? 'write intent without tool call'
              : missedTool
                ? `expected tool ${expectedTool} but no tool call`
                : null),
          meta: {
            kind: 'request',
            request_id: requestId,
            fenshen_id: requestFenshen?.id ?? null,
            model: modelLabel,
            tools_count: Object.keys(activeTools).length,
            expected_tool: expectedTool ?? null,
            tool_calls: toolTrace,
            tokens: usage ?? null,
            finish_reason: finishReason,
            truncated: finishReason === 'length',
            empty_reply: !reply.trim(),
            empty_stream: emptyStream,
            silent_write: silentWrite,
            retried,
            tool_turn: !!pushToDevResult,
            error_type: errorType ?? null,
          },
        });

        stopHeartbeat();
        await streamData.close();
        console.log(`chat ok in ${Date.now() - startTime}ms`);
      },
    });

    return result.toDataStreamResponse({
      data: streamData,
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      },
      getErrorMessage: e =>
        e instanceof Error ? e.message : 'model request failed',
    });
  } catch (err) {
    console.error('chat route error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

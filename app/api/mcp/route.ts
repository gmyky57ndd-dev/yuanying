import { NextRequest, NextResponse } from 'next/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { supabase } from '@/lib/db';
import { getConfigTimezone, getDayRange } from '@/lib/timezone';
import { readMailbox, writeMailbox } from '@/lib/mailbox';
import { queryExternalChats } from '@/lib/external-chats';
import { APP_VERSION } from '@/lib/app-version';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const expected = process.env.MCP_TOKEN || process.env.API_TOKEN || '';
  if (!expected && process.env.NODE_ENV !== 'production') return true;
  return req.headers.get('authorization') === `Bearer ${expected}`;
}

function text(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function buildServer() {
  const server = new McpServer({ name: 'yuanying', version: APP_VERSION });

  server.registerTool(
    'get_notes',
    {
      description: "Read the owner's notes for a date (YYYY-MM-DD).",
      inputSchema: { date: z.string().describe('Date in YYYY-MM-DD') },
    },
    async ({ date }) => {
      const tz = await getConfigTimezone();
      const { start, end } = getDayRange(date, tz);
      const { data, error } = await supabase
        .from('signals')
        .select('value, created_at')
        .eq('name', 'note')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      return text({
        date,
        notes: (data ?? []).map((row: any) => ({
          text: row.value?.text ?? '',
          at: row.created_at,
        })),
      });
    }
  );

  server.registerTool(
    'get_conversation_records',
    {
      description: 'Search distilled conversation records and specs by keyword.',
      inputSchema: { keyword: z.string() },
    },
    async ({ keyword }) => {
      const needle = keyword.toLowerCase();
      const results: Array<{ file: string; title: string; snippet: string }> = [];
      const fs = await import('fs');
      const path = await import('path');
      for (const rel of ['core/memory/conversations', 'docs/specs']) {
        const dir = path.join(process.cwd(), rel);
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse()) {
          const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
          const lower = raw.toLowerCase();
          const idx = lower.indexOf(needle);
          if (idx < 0) continue;
          const title = (raw.match(/^#\s+(.+)$/m)?.[1] ?? file).replace(
            /^Conversation Record\s*—\s*/,
            ''
          );
          results.push({
            file,
            title,
            snippet: raw.slice(Math.max(0, idx - 300), idx + 900).replace(/\s+/g, ' ').trim(),
          });
          if (results.length >= 6) break;
        }
        if (results.length >= 6) break;
      }
      return text({ keyword, matches: results });
    }
  );

  server.registerTool(
    'get_summary',
    {
      description: 'Read a stored daily summary.',
      inputSchema: { date: z.string() },
    },
    async ({ date }) => {
      const tz = await getConfigTimezone();
      const { data, error } = await supabase
        .from('summaries')
        .select('date, data')
        .eq('date', date)
        .eq('timezone', tz)
        .eq('type', 'day')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return text(data ?? { date, summary: null });
    }
  );

  server.registerTool(
    'read_local_file',
    {
      description: 'Read a file from the mailbox/ directory.',
      inputSchema: { path: z.string().describe('Path under mailbox/') },
    },
    async ({ path }) => text(await readMailbox(path))
  );

  server.registerTool(
    'write_local_file',
    {
      description: 'Write a file under mailbox/ through a Git commit.',
      inputSchema: {
        path: z.string().describe('Path under mailbox/'),
        content: z.string(),
      },
    },
    async ({ path, content }) => text(await writeMailbox(path, content))
  );

  server.registerTool(
    'query_external_chats',
    {
      description: 'Search imported external AI conversations.',
      inputSchema: { query: z.string() },
    },
    async ({ query }) => text(await queryExternalChats(query))
  );

  server.registerTool(
    'get_body_status',
    {
      description: 'Return PWA, LLM, and Collector versions.',
      inputSchema: {},
    },
    async () => {
      const { data } = await supabase
        .from('config')
        .select('key, value')
        .in('key', ['collector_version', 'collector_last_report_at', 'active_model_id']);
      return text({ pwa_version: APP_VERSION, config: data ?? [] });
    }
  );

  return server;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const server = await buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST for MCP Streamable HTTP' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Use POST for MCP Streamable HTTP' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

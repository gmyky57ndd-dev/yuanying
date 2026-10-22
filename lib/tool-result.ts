const MAX_VERBOSE_CHARS = 800;
// ES-060: a hard ceiling for anything handed to the model, independent of mode.
// Tool payloads that exceed this are truncated with an explicit note so the
// model knows it did not see everything.
const HARD_CAP_CHARS = 1000;
// Issues need their latest comments to be useful; still bounded.
const CAP_BY_TOOL: Record<string, number> = {
  get_issue: 5000,
};

function clip(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

function summarize(name: string, result: any): any {
  if (!result || result.success === false) return result;

  switch (name) {
    case 'get_notes': {
      const notes = result.data ?? result.notes ?? [];
      return {
        success: true,
        data: {
          count: notes.length,
          titles: notes.map((n: any) => clip(String(n.text ?? ''), 80)),
        },
        message: 'Done.',
      };
    }
    case 'get_conversation_records': {
      const matches = result.data ?? result.matches ?? [];
      // ES-062: chat matches carry role/time/snippet; dropping them made the
      // model report "6 rows but empty content".
      return {
        success: true,
        data: {
          count: matches.length,
          items: matches.slice(0, 6).map((m: any) => ({
            source: m.source ?? 'file',
            role: m.role ?? null,
            at: m.at ?? null,
            title: m.title ?? m.file ?? null,
            snippet: clip(String(m.snippet ?? ''), 400),
          })),
        },
        message: 'Done.',
      };
    }
    case 'push_to_dev': {
      if (result.data?.queued) {
        return {
          success: true,
          status: 'queued',
          job_id: result.data.job_id,
          message: 'Queued.',
        };
      }
      if (result.data?.issue_url) {
        return {
          success: true,
          status: 'success',
          issue_number: result.data.number,
          url: result.data.issue_url,
          message: `Done. Issue #${result.data.number} created.`,
        };
      }
      return result;
    }
    case 'get_summary': {
      const data = result.data ?? {};
      return {
        success: true,
        data: {
          date: result.date,
          water: data.water,
          steps: data.steps,
          wake: data.wake,
          notes_count: data.notes?.count ?? 0,
        },
        message: 'Summary loaded.',
      };
    }
    case 'get_drive_doc':
      return {
        success: true,
        data: {
          note_id: result.note_id,
          file_id: result.file_id,
          title: result.title,
          format: result.format,
          meta: result.meta,
        },
        message: 'Done.',
      };
    case 'get_model_info':
      return result;
    case 'web_search': {
      const results = result.data ?? [];
      return {
        success: true,
        data: results.map((r: any) => ({ title: r.title, url: r.url })),
        message: 'Results returned.',
      };
    }
    case 'read_markdown':
      return {
        success: true,
        data: {
          path: result.meta?.path,
          truncated: result.meta?.truncated,
          total_chars: result.meta?.total_chars,
        },
        message: 'Markdown loaded.',
      };
    case 'get_issue': {
      const data = result.data ?? {};
      const comments = Array.isArray(data.comments) ? data.comments : [];
      // ES-061 follow-up: the owner and 元婴 must be able to read what devs
      // wrote. Returning only a count made every reply look like "no answer".
      // The newest comment carries the answer; give it room. Older comments
      // only need a gist. 450 chars cut the v1.0.37 note mid-sentence (#74).
      const latest = comments.slice(-3).map((c: any, i: number) => ({
        author: c.author,
        body: clip(String(c.body ?? ''), i === comments.slice(-3).length - 1 ? 1800 : 400),
      }));
      return {
        success: true,
        data: {
          number: data.number,
          title: data.title,
          state: data.state,
          labels: data.labels,
          url: data.url,
          body: clip(String(data.body ?? ''), 600),
          comments_count: comments.length,
          latest_comments: latest,
          comments_error: data.comments_error ?? null,
        },
        message: 'Issue loaded (latest comments included).',
      };
    }
    case 'ingest_external_chat':
      return {
        success: true,
        data: result.data,
        message: 'External chat saved.',
      };
    case 'query_external_chats': {
      const chats = result.data ?? [];
      return {
        success: true,
        data: chats.map((c: any) => ({
          id: c.id,
          source: c.source,
          created_at: c.created_at,
          excerpt: clip(String(c.content ?? ''), 1000),
        })),
        message: 'External chats found.',
      };
    }
    case 'ask_claude':
    case 'ask_external_agent':
      return result;
    case 'read_local_file':
      return {
        success: true,
        data: { path: result.data?.path, chars: result.data?.chars },
        message: 'Mailbox file loaded.',
      };
    case 'write_local_file':
      return result;
    case 'write_markdown':
    case 'scheduler':
      return result;
    default:
      return result;
  }
}

/**
 * ES-051: silent mode returns a short summary; verbose mode returns the full
 * result but hard-caps it so the model cannot echo an unbounded payload.
 */
export function normalizeToolResult(
  name: string,
  result: any,
  verbose: boolean
): any {
  if (!verbose) {
    try {
      return summarize(name, result);
    } catch {
      return result;
    }
  }

  const text = JSON.stringify(result);
  if (text.length <= MAX_VERBOSE_CHARS) return hardCap(result, name);

  return hardCap({
    success: result?.success !== false,
    data: `${text.slice(0, MAX_VERBOSE_CHARS)}… [内容已截断]`,
    meta: { truncated: true, message: '[内容已截断]' },
  }, name);
}

function hardCap(value: any, name?: string): any {
  const limit = (name && CAP_BY_TOOL[name]) || HARD_CAP_CHARS;
  try {
    const text = JSON.stringify(value);
    if (text.length <= limit) return value;
    return {
      success: value?.success !== false,
      truncated: true,
      data: text.slice(0, limit),
      note: `Tool result truncated from ${text.length} to ${limit} characters. Summarize only what is here; do not claim to have seen the rest.`,
    };
  } catch {
    return value;
  }
}

/**
 * ES-079: some models emit tool calls as *text* instead of native tool_calls,
 * e.g. `<tool_call>{"name":"read_local_file","arguments":{"path":"…"}}</tool_call>`
 * or a fenced ```json block. The chat route executes these as real calls (only
 * if the tool is in the active whitelist) and the client strips the markup.
 */
export type TextualToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type TextualToolCallResult = {
  calls: TextualToolCall[];
  text: string;
  hadMarkers: boolean;
};

function parseArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }
  return {};
}

function collectFromJson(parsed: unknown, out: TextualToolCall[]): void {
  if (Array.isArray(parsed)) {
    for (const item of parsed) collectFromJson(item, out);
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.name === 'string') {
    out.push({
      name: obj.name,
      args: parseArgs(obj.arguments ?? obj.parameters ?? {}),
    });
    return;
  }
  if (Array.isArray(obj.tool_calls)) collectFromJson(obj.tool_calls, out);
  if (Array.isArray(obj.calls)) collectFromJson(obj.calls, out);
}

/** ES-082: `write_markdown({...})` / `write_local_file(path="…", content="…")`. */
function parseFunctionSyntax(body: string, out: TextualToolCall[]): boolean {
  const m = body.match(/^([a-zA-Z_][\w]*)\s*\(([\s\S]*)\)$/);
  if (!m) return false;
  const name = m[1];
  const raw = m[2].trim();
  if (!raw) {
    out.push({ name, args: {} });
    return true;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      out.push({ name, args: parsed as Record<string, unknown> });
      return true;
    }
  } catch {
    // fall through to kwargs
  }
  const args: Record<string, unknown> = {};
  const re = /([a-zA-Z_][\w]*)\s*=\s*("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^,]+)/g;
  let km: RegExpExecArray | null;
  while ((km = re.exec(raw))) {
    const key = km[1];
    let value: unknown = km[2].trim();
    try {
      value = JSON.parse(value as string);
    } catch {
      value = String(value).trim();
    }
    args[key] = value;
  }
  if (Object.keys(args).length === 0) return false;
  out.push({ name, args });
  return true;
}

function parseBody(body: string, out: TextualToolCall[]): void {
  const trimmed = body.trim();
  if (!trimmed) return;
  try {
    collectFromJson(JSON.parse(trimmed), out);
  } catch {
    if (parseFunctionSyntax(trimmed, out)) return;
    // Some models wrap the JSON in prose; try the first {...} / [...] chunk.
    const match = trimmed.match(/[[{][\s\S]*[\]}]/);
    if (!match) return;
    try {
      collectFromJson(JSON.parse(match[0]), out);
    } catch {
      // ignore malformed calls; the text is still stripped
    }
  }
}


/** DeepSeek DSML: <｜｜DSML｜｜ calls>…<｜｜DSML｜｜ invoke name="x">… */
function parseDsml(input: string, out: TextualToolCall[]): { text: string; had: boolean } {
  let text = input;
  let had = false;
  const invokeRe =
    /<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*invoke\b([^>]*)>([\s\S]*?)<\/[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*invoke>/gi;
  text = text.replace(invokeRe, (_m, attrs: string, body: string) => {
    had = true;
    const nameMatch = /name\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const name = nameMatch?.[1]?.trim();
    if (!name) return '';
    const args: Record<string, unknown> = {};
    const paramRe =
      /<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*parameter\b([^>]*)>([\s\S]*?)<\/[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*parameter>/gi;
    let pm: RegExpExecArray | null;
    while ((pm = paramRe.exec(body))) {
      const pAttrs = pm[1] ?? '';
      const pName = /name\s*=\s*["']([^"']+)["']/i.exec(pAttrs)?.[1]?.trim();
      if (!pName) continue;
      const raw = pm[2].trim();
      const isString = /string\s*=\s*["']true["']/i.test(pAttrs);
      if (isString) {
        args[pName] = raw;
      } else {
        try {
          args[pName] = JSON.parse(raw);
        } catch {
          args[pName] = raw;
        }
      }
    }
    if (name === 'run_terminal_command' && typeof args.command === 'string' && !args.argv) {
      args.argv = args.command.trim().split(/\s+/).filter(Boolean);
      delete args.command;
    }
    out.push({ name, args });
    return '';
  });
  // Some streams cut the closing invoke tag. Parse an unclosed invoke too.
  if (out.length === 0) {
    const openRe =
      /<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*invoke\b([^>]*)>([\s\S]*?)(?=<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*invoke|$)/gi;
    text = text.replace(openRe, (_m, attrs: string, body: string) => {
      const name = /name\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.trim();
      if (!name) return '';
      had = true;
      const args: Record<string, unknown> = {};
      const paramRe =
        /<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*parameter\b([^>]*)>([\s\S]*?)(?:<\/[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*parameter>|$)/gi;
      let pm: RegExpExecArray | null;
      while ((pm = paramRe.exec(body))) {
        const pName = /name\s*=\s*["']([^"']+)["']/i.exec(pm[1] ?? '')?.[1]?.trim();
        if (!pName) continue;
        const raw = pm[2].trim();
        try {
          args[pName] = JSON.parse(raw);
        } catch {
          args[pName] = raw;
        }
      }
      if (name === 'run_terminal_command' && typeof args.command === 'string' && !args.argv) {
        args.argv = args.command.trim().split(/\s+/).filter(Boolean);
        delete args.command;
      }
      out.push({ name, args });
      return '';
    });
  }

  // Remove wrapper tags and any remaining DSML markers.
  const before = text;
  text = text
    .replace(/<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*calls\s*>/gi, '')
    .replace(/<\/[｜|]{1,2}\s*DSML\s*[｜|]{1,2}\s*calls\s*>/gi, '')
    .replace(/<\/?[｜|]{1,2}\s*DSML\s*[｜|]{1,2}[^>]*>/gi, '');
  if (text !== before) had = true;
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), had };
}

export function extractTextualToolCalls(input: string): TextualToolCallResult {
  const calls: TextualToolCall[] = [];
  let text = input;
  let hadMarkers = false;

  const dsml = parseDsml(text, calls);
  text = dsml.text;
  hadMarkers = hadMarkers || dsml.had;

  // <tool_call>…</tool_call> / <tool_calls>…</tool_calls> /
  // <function_call>…</function_call> and the <|tool_call|> variant.
  const tagged = /<(tool_calls?|function_calls?)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  text = text.replace(tagged, (_m, _tag, body: string) => {
    hadMarkers = true;
    parseBody(body, calls);
    return '';
  });
  const piped = /<\|tool_calls?\|>([\s\S]*?)<(?:\|\/|\/\|)tool_calls?\|>/gi;
  text = text.replace(piped, (_m, body: string) => {
    hadMarkers = true;
    parseBody(body, calls);
    return '';
  });

  // Fenced ```json blocks that contain a tool call.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  text = text.replace(fenced, (m, body: string) => {
    const before = calls.length;
    parseBody(body, calls);
    if (calls.length > before) {
      hadMarkers = true;
      return '';
    }
    return m;
  });

  return {
    calls,
    text: text.replace(/\n{3,}/g, '\n\n').trim(),
    hadMarkers,
  };
}

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

function parseBody(body: string, out: TextualToolCall[]): void {
  const trimmed = body.trim();
  if (!trimmed) return;
  try {
    collectFromJson(JSON.parse(trimmed), out);
  } catch {
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

export function extractTextualToolCalls(input: string): TextualToolCallResult {
  const calls: TextualToolCall[] = [];
  let text = input;
  let hadMarkers = false;

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

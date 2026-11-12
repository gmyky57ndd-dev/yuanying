export type SystemEvent = {
  id: number;
  ts: string;
  route: string;
  status: number;
  duration_ms: number | null;
  error: string | null;
  meta: Record<string, unknown> | null;
};

const PRIVATE_KEYS =
  /^(content|text|body|message|prompt|query|keyword|note|reply|description)$/i;

/** #108: args are logged structurally; private text is reduced to its length. */
export function summarizeToolArgs(
  args: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args ?? {})) {
    if (PRIVATE_KEYS.test(key)) {
      out[key] =
        typeof value === 'string' ? `<redacted:${value.length}>` : '<redacted>';
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value.length > 120 ? `<str:${value.length}>` : value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = `<array:${value.length}>`;
    } else if (value && typeof value === 'object') {
      out[key] = `<object:${Object.keys(value).length} keys>`;
    } else {
      out[key] = null;
    }
  }
  return out;
}

export function classifyStreamError(message: string | null): string | undefined {
  if (!message) return undefined;
  if (/abort|timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message)) {
    return 'timeout';
  }
  return 'model_error';
}


export function describeEvent(e: SystemEvent): string {
  const meta = (e.meta ?? {}) as Record<string, unknown>;
  const errorType = typeof meta.error_type === 'string' ? meta.error_type : null;
  const tool = typeof meta.tool === 'string' ? meta.tool : null;
  if (errorType === 'timeout' || e.status === 504) {
    return `${e.route} 超时（${e.duration_ms ?? '?'}ms）：模型/网关未在时限内返回`;
  }
  if (errorType === 'empty_stream') {
    return `${e.route} 空流：模型返回 0 字符${tool ? `（${tool}）` : ''}`;
  }
  if (errorType === 'no_tool_call') {
    return `${e.route} 未发起工具调用：模型只输出了文字`;
  }
  if (errorType === 'whitelist_denied') {
    return `${e.route} 工具被白名单拒绝：${tool ?? 'unknown'}`;
  }
  if (errorType === 'truncated') {
    return `${e.route} 输出被截断（finishReason=length）`;
  }
  if (meta.kind === 'tool' && e.status === 200 && tool) {
    return `工具 ${tool} 成功（${e.duration_ms ?? '?'}ms）`;
  }
  if (errorType === 'tool_error' || (tool && e.status >= 500)) {
    return `${e.route} 工具失败：${tool ?? 'unknown'} — ${e.error ?? '未知'}`;
  }
  if (e.status === 200) return `${e.route} 正常（${e.duration_ms ?? '?'}ms）`;
  if (e.status === 401 || e.status === 403) return `${e.route} 认证失败（${e.status}）`;
  if (e.status >= 500) {
    return `${e.route} 服务端错误（${e.status}）：${e.error ?? '未知'}`;
  }
  return `${e.route} 返回 ${e.status}${e.error ? `：${e.error}` : ''}`;
}

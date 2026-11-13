import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LOG_SOURCES = {
  desktop: path.join(os.homedir(), 'Library/Logs/com.yuanying.desktop/desktop.log'),
  bridge: '/tmp/yy-web.log',
  sync: '/tmp/yy-sync.log',
} as const;

export type LogSource = keyof typeof LOG_SOURCES;

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***'],
  [/(gh[pousr]_[A-Za-z0-9_]{8,})/g, 'gh-***'],
  [/((?:api[_-]?key|token|secret|password|authorization|cookie)\s*[:=]\s*)[^\s,;]+/gi, '$1***'],
  [/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***'],
];

function redact(line: string): string {
  let out = line;
  for (const [re, replacement] of SECRET_PATTERNS) out = out.replace(re, replacement);
  return out;
}

/** v0.02a: read-only log tail with source allowlist + secret redaction. */
export function readServerLogs(source: unknown, lines: unknown): {
  source: LogSource;
  lines: number;
  content: string;
  truncated: boolean;
} {
  const key = (typeof source === 'string' ? source : 'desktop') as LogSource;
  if (!(key in LOG_SOURCES)) {
    throw new Error(`unknown log source: ${key}; allowed: ${Object.keys(LOG_SOURCES).join(', ')}`);
  }
  const file = LOG_SOURCES[key];
  if (!fs.existsSync(file)) throw new Error(`log not found: ${key}`);

  const wanted = Math.min(Math.max(Number(lines) || 100, 1), 500);
  const stat = fs.statSync(file);
  const chunkSize = Math.min(stat.size, 256 * 1024);
  const fd = fs.openSync(file, 'r');
  let raw = '';
  try {
    const buf = Buffer.alloc(chunkSize);
    fs.readSync(fd, buf, 0, chunkSize, Math.max(0, stat.size - chunkSize));
    raw = buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }

  const all = raw.split('\n');
  const tail = all.slice(Math.max(0, all.length - wanted - 1));
  const redacted = tail.map(l => redact(l.slice(0, 2000)));
  const content = redacted.join('\n').slice(-120000);
  return {
    source: key,
    lines: redacted.length,
    content,
    truncated: stat.size > chunkSize,
  };
}

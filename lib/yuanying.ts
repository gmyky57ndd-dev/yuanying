import fs from 'fs';
import path from 'path';

interface BuildOptions {
  signals?: Array<{ name: string; created_at: string }>;
  now?: string;
}

let coreCache: string | null = null;
let coreCacheMtime = 0;

function loadCore(): string {
  const coreDir = path.join(process.cwd(), 'core');
  const files = ['identity.md', 'values.md', 'voice.md'];

  const stat = fs.statSync(path.join(coreDir, files[0]));

  if (coreCache && stat.mtimeMs === coreCacheMtime) {
    return coreCache;
  }

  coreCache = files
    .map(f => {
      const fp = path.join(coreDir, f);
      const content = fs.readFileSync(fp, 'utf-8');
      return `## ${f}\n\n${content}`;
    })
    .join('\n\n---\n\n');

  coreCacheMtime = stat.mtimeMs;

  return coreCache;
}

function buildSignalContext(
  signals: Array<{ name: string; created_at: string }>
): string {
  if (!signals || signals.length === 0) {
    return "\n\n# Today's signals\n\nNone yet.";
  }

  const lines = signals.map(s => {
    const t = new Date(s.created_at);
    const time = t.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Shanghai',
    });
    return `- ${s.name} at ${time}`;
  });

  return `\n\n# Today's signals\n\n${lines.join('\n')}`;
}

export function buildSystemPrompt(opts: BuildOptions = {}): string {
  const core = loadCore();
  const signalCtx = buildSignalContext(opts.signals ?? []);
  const now = opts.now ?? new Date().toISOString();

  return `${core}

---

# Runtime

You are running as a phone PWA prototype.
Keep responses short — this is a phone screen.

## Signal definitions

- **wake** — 起床。每天第一次醒来时点击。
- **sleep** — 入睡。准备睡觉时点击。
- **water** — 喝水。每次喝水时点击，一天可多次。
- **sit** — 久坐后起身。长时间坐着后站立或走动时点击。

If the user asks what these buttons do, answer from the
definitions above. Do not invent other meanings.

If you don't know something, say so. Do not fabricate.

## Current time

${now}

Timezone: Asia/Shanghai
${signalCtx}
`;
}

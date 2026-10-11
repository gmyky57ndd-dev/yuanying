import fs from 'fs';
import path from 'path';

let cached: string | null = null;

export function buildSystemPrompt(): string {
  if (cached) return cached;

  const coreFiles = ['identity.md', 'values.md', 'voice.md'];
  const core = coreFiles
    .map(f =>
      fs.readFileSync(path.join(process.cwd(), 'core', f), 'utf-8')
    )
    .join('\n\n---\n\n');

  cached = `${core}

---

# Runtime

You are running as a phone PWA prototype. The user has
four signals: wake, sleep, water, sit. Today's signals
will be listed below when relevant.

Keep responses short. This is a phone screen.

Current time: ${new Date().toISOString()}
`;

  return cached;
}

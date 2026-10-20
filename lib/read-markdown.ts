import fs from 'fs';
import path from 'path';

const MAX_CHARS = 20_000;
const ALLOWED_ROOTS = [
  'docs/specs',
  'docs/help',
  'docs/runbooks',
  'core',
];
const ALLOWED_FILES = ['AGENTS.md', 'TRACKING.md', 'README.md'];

function normalize(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

export type MarkdownFile = {
  success: true;
  path: string;
  text: string;
  truncated: boolean;
  total_chars: number;
};

/** ES-036: read a Markdown file from an allowlisted repo path. */
export async function readMarkdown(input: string): Promise<MarkdownFile> {
  const rel = normalize(input.trim());
  if (!rel) throw new Error('path is required');
  if (rel.includes('\0') || rel.startsWith('/') || rel.split('/').includes('..')) {
    throw new Error('Unsafe path.');
  }
  if (!rel.endsWith('.md')) {
    throw new Error('Only .md files are supported.');
  }

  const allowed =
    ALLOWED_FILES.includes(rel) ||
    ALLOWED_ROOTS.some(root => rel === root || rel.startsWith(`${root}/`));
  if (!allowed) {
    throw new Error(
      'Path not allowed. Allowed: docs/specs, docs/help, docs/runbooks, core, AGENTS.md, TRACKING.md, README.md.'
    );
  }

  const full = path.join(process.cwd(), rel);
  if (!fs.existsSync(full)) {
    throw new Error(`File not found: ${rel}`);
  }

  const raw = fs.readFileSync(full, 'utf-8');
  const chars = Array.from(raw);
  return {
    success: true,
    path: rel,
    text: chars.length <= MAX_CHARS ? raw : chars.slice(0, MAX_CHARS).join(''),
    truncated: chars.length > MAX_CHARS,
    total_chars: chars.length,
  };
}

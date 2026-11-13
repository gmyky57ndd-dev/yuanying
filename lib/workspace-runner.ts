import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { supabase } from './db';

const execFileAsync = promisify(execFile);
const ROOT = path.join(os.homedir(), 'yuanying', 'workspace');
const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/;
const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt',
  '.css', '.scss', '.html', '.py', '.go', '.rs', '.sh', '.yml', '.yaml',
  '.sql', '.toml',
]);
const FORBIDDEN = /(^|\/)(\.git|node_modules|\.env[^/]*)(\/|$)|secret/i;

async function requireApproval(approvalId: number, projectId: string) {
  const { data } = await supabase
    .from('work_approvals')
    .select('id, status, project_id')
    .eq('id', approvalId)
    .maybeSingle();
  if (!data) throw new Error(`approval not found: ${approvalId}`);
  if (data.project_id !== projectId) throw new Error('approval project mismatch');
  if (!['approved', 'implementing'].includes(String(data.status))) {
    throw new Error(`approval #${approvalId} is ${data.status}; approved required`);
  }
}

function workspace(projectId: string): string {
  if (!PROJECT_RE.test(projectId)) throw new Error('invalid project_id');
  const dir = path.join(ROOT, projectId);
  fs.mkdirSync(dir, { recursive: true });
  return fs.realpathSync(dir);
}

function inside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

function safeCodePath(projectId: string, rel: string): string {
  const root = workspace(projectId);
  const clean = rel.trim().replace(/^\/+/, '');
  if (!clean || clean.includes('..') || FORBIDDEN.test(clean)) {
    throw new Error('path denied');
  }
  const ext = path.extname(clean).toLowerCase();
  if (!CODE_EXT.has(ext)) throw new Error(`extension denied: ${ext || '(none)'}`);
  const target = path.resolve(root, clean);
  if (!inside(root, target)) throw new Error('path outside workspace');
  return target;
}

export async function writeCodeFile(args: {
  approval_id: number;
  project_id: string;
  path: string;
  content: string;
}) {
  const approvalId = Number(args.approval_id);
  if (!Number.isInteger(approvalId) || approvalId <= 0) throw new Error('approval_id required');
  const projectId = String(args.project_id ?? '').trim();
  await requireApproval(approvalId, projectId);
  const target = safeCodePath(projectId, String(args.path ?? ''));
  if (typeof args.content !== 'string') throw new Error('content required');
  const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, args.content, 'utf8');
  return {
    project_id: projectId,
    path: path.relative(workspace(projectId), target),
    changed: before !== args.content,
    before_bytes: Buffer.byteLength(before),
    after_bytes: Buffer.byteLength(args.content),
    preview: args.content.slice(0, 2000),
    workspace: workspace(projectId),
  };
}

const COMMANDS: Array<{ cmd: string; args: (a: string[]) => boolean; label: string }> = [
  { cmd: 'node', args: a => a.length === 1 && a[0] === '--version', label: 'node --version' },
  { cmd: 'pwd', args: a => a.length === 0, label: 'pwd' },
  { cmd: 'ls', args: a => a.length === 0 || (a.length === 1 && a[0] === '-la'), label: 'ls' },
  { cmd: 'git', args: a => a.length === 1 && (a[0] === 'status' || a[0] === 'diff'), label: 'git status|diff' },
  { cmd: 'npm', args: a => a.length === 2 && a[0] === 'run' && ['test', 'lint', 'build'].includes(a[1]), label: 'npm run test|lint|build' },
  { cmd: 'npm', args: a => a.length === 1 && a[0] === 'test', label: 'npm test' },
  { cmd: 'npm', args: a => a.length === 1 && a[0] === 'ci', label: 'npm ci' },
  { cmd: 'npm', args: a => a.length === 1 && a[0] === 'install', label: 'npm install' },
];

function allowedCommand(argv: string[]): string {
  if (!Array.isArray(argv) || argv.length === 0) throw new Error('argv required');
  if (!argv.every(a => typeof a === 'string' && a.length <= 200)) {
    throw new Error('argv must be short strings');
  }
  const [cmd, ...rest] = argv;
  const hit = COMMANDS.find(c => c.cmd === cmd && c.args(rest));
  if (!hit) throw new Error(`command denied: ${cmd} ${rest.join(' ')}`.trim());
  // No shell metacharacters; execFile is shell-free, but reject obviously unsafe args.
  if (rest.some(a => /[;&|><`$]/.test(a))) throw new Error('shell metacharacters denied');
  return hit.label;
}

export async function runTerminalCommand(args: {
  approval_id: number;
  project_id: string;
  argv: string[];
  timeout_ms?: number;
}) {
  const approvalId = Number(args.approval_id);
  if (!Number.isInteger(approvalId) || approvalId <= 0) throw new Error('approval_id required');
  const projectId = String(args.project_id ?? '').trim();
  await requireApproval(approvalId, projectId);
  const argv = Array.isArray(args.argv) ? args.argv.map(String) : [];
  const label = allowedCommand(argv);
  const cwd = workspace(projectId);
  const timeout = Math.min(Math.max(Number(args.timeout_ms) || 120000, 1000), 120000);

  try {
    const { stdout, stderr } = await execFileAsync(argv[0], argv.slice(1), {
      cwd,
      timeout,
      maxBuffer: 200 * 1024,
      shell: false,
      env: {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: cwd,
        NODE_ENV: 'test',
        LANG: 'en_US.UTF-8',
      },
    });
    return {
      project_id: projectId,
      command: label,
      exit_code: 0,
      stdout: String(stdout).slice(0, 20000),
      stderr: String(stderr).slice(0, 5000),
      truncated: String(stdout).length > 20000,
    };
  } catch (e: any) {
    return {
      project_id: projectId,
      command: label,
      exit_code: typeof e?.code === 'number' ? e.code : 1,
      stdout: String(e?.stdout ?? '').slice(0, 20000),
      stderr: String(e?.stderr ?? e?.message ?? 'command failed').slice(0, 5000),
      truncated: false,
      timed_out: e?.killed === true,
    };
  }
}

export async function runTestSuite(args: {
  approval_id: number;
  project_id: string;
  suite?: 'unit' | 'e2e';
}) {
  const suite = args.suite === 'e2e' ? 'e2e' : 'unit';
  return runTerminalCommand({
    approval_id: args.approval_id,
    project_id: args.project_id,
    argv: suite === 'e2e' ? ['npm', 'run', 'test:e2e'] : ['npm', 'test'],
    timeout_ms: 120000,
  });
}

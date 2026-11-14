import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * GitHub App token broker (ADR-005).
 *
 * The App private key is never committed. It is read from env
 * GITHUB_APP_PRIVATE_KEY or a local 0600 file. Installation tokens are
 * short-lived and scoped per role/repository.
 */

const APP_ID = process.env.GITHUB_APP_ID || '5761017';
const DEFAULT_KEY_PATHS = [
  path.join(os.homedir(), 'Library/Application Support/com.yuanying.desktop/github-app.pem'),
  path.join(os.homedir(), '.yuanying/github-app.pem'),
];

const ROLE_PERMISSIONS: Record<string, Record<string, string>> = {
  xiaowu: { metadata: 'read', contents: 'read', issues: 'write', pull_requests: 'read' },
  ai_pm: { metadata: 'read', contents: 'read', issues: 'write', pull_requests: 'read' },
  ai_architect: { metadata: 'read', contents: 'read', issues: 'write', pull_requests: 'read' },
  dsh: { metadata: 'read', contents: 'write', issues: 'write', pull_requests: 'write' },
  qa: { metadata: 'read', contents: 'read', issues: 'write', pull_requests: 'read' },
  devops: { metadata: 'read', contents: 'read', actions: 'read' },
  librarian: { metadata: 'read', contents: 'read' },
};

export type GithubAppToken = {
  token: string;
  expires_at: string;
  installation_id: number;
  repository: string;
  permissions: Record<string, string>;
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function keyMaterial(): string {
  if (process.env.GITHUB_APP_PRIVATE_KEY) {
    return process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  for (const p of DEFAULT_KEY_PATHS) {
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        if ((stat.mode & 0o077) !== 0) {
          console.warn(`github app key ${p} is group/world readable; chmod 600`);
        }
      } catch {
        // ignore mode check
      }
      return fs.readFileSync(p, 'utf8');
    }
  }
  throw new Error(
    `GitHub App private key not found. Put it at ${DEFAULT_KEY_PATHS[0]} (chmod 600) or set GITHUB_APP_PRIVATE_KEY.`
  );
}

function b64url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function appJwt(now = Date.now()): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iat: Math.floor(now / 1000) - 60,
      exp: Math.floor(now / 1000) + 540,
      iss: APP_ID,
    })
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(keyMaterial(), 'base64url');
  return `${header}.${payload}.${signature}`;
}

async function appFetch(pathname: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${appJwt()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'yuanying-github-app',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`GitHub App ${res.status}: ${json?.message ?? text.slice(0, 200)}`);
  }
  return json;
}

export async function listInstallations(): Promise<
  Array<{ id: number; account: string; repository_selection: string; html_url: string }>
> {
  const rows = await appFetch('/app/installations');
  return (rows ?? []).map((r: any) => ({
    id: r.id,
    account: r.account?.login ?? 'unknown',
    repository_selection: r.repository_selection,
    html_url: r.html_url,
  }));
}

export async function installationForRepo(repoFullName: string): Promise<number> {
  const [owner, repo] = repoFullName.split('/');
  if (!owner || !repo) throw new Error('repo must be owner/name');
  const data = await appFetch(`/repos/${owner}/${repo}/installation`);
  if (!data?.id) throw new Error(`no installation for ${repoFullName}`);
  return Number(data.id);
}

export async function installationToken(args: {
  installationId: number;
  repository: string;
  role?: string;
  permissions?: Record<string, string>;
}): Promise<GithubAppToken> {
  const repo = args.repository.split('/').pop();
  if (!repo) throw new Error('repository name required');
  const permissions = args.permissions ?? ROLE_PERMISSIONS[args.role ?? ''] ?? {
    metadata: 'read',
    contents: 'read',
  };
  const cacheKey = `${args.installationId}:${repo}:${JSON.stringify(permissions)}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return {
      token: cached.token,
      expires_at: new Date(cached.expiresAt).toISOString(),
      installation_id: args.installationId,
      repository: args.repository,
      permissions,
    };
  }

  const data = await appFetch(`/app/installations/${args.installationId}/access_tokens`, {
    method: 'POST',
    body: JSON.stringify({ repositories: [repo], permissions }),
  });
  const expiresAt = new Date(data.expires_at).getTime();
  tokenCache.set(cacheKey, { token: data.token, expiresAt });
  return {
    token: data.token,
    expires_at: data.expires_at,
    installation_id: args.installationId,
    repository: args.repository,
    permissions,
  };
}

export function rolePermissions(role: string): Record<string, string> {
  return ROLE_PERMISSIONS[role] ?? { metadata: 'read', contents: 'read' };
}

export function githubAppConfig() {
  return {
    app_id: APP_ID,
    client_id: process.env.GITHUB_APP_CLIENT_ID || 'Iv23liFv6YmHrm16hq1v',
    key_paths: DEFAULT_KEY_PATHS,
    key_present: (() => {
      try {
        keyMaterial();
        return true;
      } catch {
        return false;
      }
    })(),
  };
}

import { installationToken } from './github-app.ts';

/**
 * ADR-005: prefer a short-lived GitHub App installation token scoped to the
 * active fenshen. Falls back to the legacy PAT only when the App is not
 * configured (GITHUB_APP_INSTALLATION_ID missing).
 */
export async function githubTokenForRole(role?: string | null): Promise<string> {
  const installationId = Number(process.env.GITHUB_APP_INSTALLATION_ID ?? 0);
  const repo = process.env.GITHUB_REPO;
  if (installationId > 0 && repo) {
    const token = await installationToken({
      installationId,
      repository: repo,
      role: role || 'xiaowu',
    });
    return token.token;
  }
  const pat = process.env.GITHUB_TOKEN;
  if (!pat) throw new Error('GitHub auth missing: no App installation id and no GITHUB_TOKEN');
  return pat;
}

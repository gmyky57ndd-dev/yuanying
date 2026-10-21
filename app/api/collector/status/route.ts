import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PLAY_INTERNAL_URL =
  'https://play.google.com/apps/internaltest/4701496216557819136';

function versionParts(value: string): number[] {
  return value.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
}

function isNewer(latest: string, installed: string): boolean {
  const a = versionParts(latest);
  const b = versionParts(installed);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export async function GET() {
  const { data: cfg } = await supabase
    .from('config')
    .select('key, value')
    .in('key', [
      'collector_version',
      'collector_version_code',
      'collector_last_report_at',
      'collector_overlay_active',
    ]);

  const config = Object.fromEntries(
    (cfg ?? []).map((row: { key: string; value: unknown }) => [
      row.key,
      row.value,
    ])
  );

  const { data: lastSignal } = await supabase
    .from('signals')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const installedVersion =
    typeof config.collector_version === 'string'
      ? config.collector_version
      : null;

  let latestVersion: string | null = null;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (repo && token) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(
          `https://api.github.com/repos/${repo}/releases/latest`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'yuanying-pwa',
            },
            cache: 'no-store',
            signal: controller.signal,
          }
        );
        if (res.ok) {
          const release = await res.json();
          latestVersion =
            typeof release?.tag_name === 'string'
              ? release.tag_name.replace(/^v/, '')
              : null;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      /* best-effort */
    }
  }

  const lastReportAt =
    typeof config.collector_last_report_at === 'string'
      ? config.collector_last_report_at
      : null;
  const lastSignalAt = lastSignal?.created_at ?? null;
  const lastSeen = lastReportAt || lastSignalAt;
  const online = lastSeen
    ? Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 60 * 1000
    : false;

  return NextResponse.json(
    {
      installed_version: installedVersion,
      installed_code:
        typeof config.collector_version_code === 'number'
          ? config.collector_version_code
          : null,
      last_report_at: lastReportAt,
      last_signal_at: lastSignalAt,
      overlay_active: config.collector_overlay_active === true,
      online,
      latest_version: latestVersion,
      update_available:
        !!installedVersion &&
        !!latestVersion &&
        isNewer(latestVersion, installedVersion),
      update_url: PLAY_INTERNAL_URL,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

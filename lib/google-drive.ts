import { randomUUID } from 'crypto';
import { supabase } from './db';

const TOKEN_ROW_ID = 'default';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const MAX_STORE_CHARS = 200_000;
const MAX_MODEL_CHARS = 12_000;

type TokenRow = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  token_type: string | null;
  updated_at: string;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
};

function clientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? '';
}

function clientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? '';
}

export function isGoogleDriveConfigured(): boolean {
  return !!clientId() && !!clientSecret();
}

export function getRedirectUri(origin: string): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${origin}/api/integrations/google-drive/callback`
  );
}

export function buildAuthorizationUrl(origin: string): {
  url: string;
  state: string;
} {
  if (!isGoogleDriveConfigured()) {
    throw new Error(
      'Google Drive is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
    );
  }

  const state = randomUUID();
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: getRedirectUri(origin),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
  };
}

async function googleError(res: Response, fallback: string): Promise<string> {
  let detail = '';
  try {
    const body = await res.json();
    detail =
      body?.error?.message ??
      body?.error_description ??
      (typeof body?.error === 'string' ? body.error : '');
  } catch {
    /* non-JSON error */
  }
  return `${fallback}${detail ? `: ${detail}` : ` (HTTP ${res.status})`}`;
}

async function saveTokens(tokens: {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number;
  scope?: string | null;
  token_type?: string | null;
}): Promise<void> {
  const { data: existing } = await supabase
    .from('google_oauth_tokens')
    .select('refresh_token')
    .eq('id', TOKEN_ROW_ID)
    .maybeSingle();

  const expiresAt =
    typeof tokens.expires_in === 'number'
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

  const { error } = await supabase.from('google_oauth_tokens').upsert(
    {
      id: TOKEN_ROW_ID,
      access_token: tokens.access_token,
      refresh_token:
        tokens.refresh_token ?? existing?.refresh_token ?? null,
      expires_at: expiresAt,
      scope: tokens.scope ?? DRIVE_SCOPE,
      token_type: tokens.token_type ?? 'Bearer',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) throw new Error(`failed to save Drive tokens: ${error.message}`);
}

export async function exchangeCode(
  code: string,
  origin: string
): Promise<void> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: getRedirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    throw new Error(await googleError(res, 'Google OAuth exchange failed'));
  }

  const tokens = await res.json();
  if (!tokens?.access_token) {
    throw new Error('Google OAuth exchange returned no access token');
  }
  await saveTokens(tokens);
}

export async function getGoogleDriveStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  updated_at: string | null;
  scope: string | null;
}> {
  const { data } = await supabase
    .from('google_oauth_tokens')
    .select('updated_at, scope')
    .eq('id', TOKEN_ROW_ID)
    .maybeSingle();

  return {
    configured: isGoogleDriveConfigured(),
    connected: !!data,
    updated_at: data?.updated_at ?? null,
    scope: data?.scope ?? null,
  };
}

export async function disconnectGoogleDrive(): Promise<void> {
  const { error } = await supabase
    .from('google_oauth_tokens')
    .delete()
    .eq('id', TOKEN_ROW_ID);
  if (error) throw new Error(`failed to disconnect Drive: ${error.message}`);
}

async function getValidAccessToken(): Promise<string | null> {
  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('id', TOKEN_ROW_ID)
    .maybeSingle();

  if (error) throw new Error(`Drive token lookup failed: ${error.message}`);
  if (!data) return null;

  const row = data as TokenRow;
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!expiresAt || expiresAt > Date.now() + 60_000) {
    return row.access_token;
  }

  if (!row.refresh_token) {
    throw new Error(
      'Google Drive authorization expired. Reconnect it in Settings.'
    );
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    throw new Error(
      await googleError(res, 'Google Drive token refresh failed')
    );
  }

  const tokens = await res.json();
  if (!tokens?.access_token) {
    throw new Error('Google Drive token refresh returned no access token');
  }
  await saveTokens({ ...tokens, refresh_token: row.refresh_token });
  return tokens.access_token as string;
}

export function extractDriveFileId(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('Google Drive file id or URL is required.');

  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }

  throw new Error('Could not parse a Google Drive file id from that link.');
}

async function fetchMetadata(
  fileId: string,
  accessToken: string
): Promise<DriveFile> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`
  );
  url.searchParams.set('fields', 'id,name,mimeType,webViewLink');
  url.searchParams.set('supportsAllDrives', 'true');

  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await googleError(res, 'Google Drive file lookup failed'));
  }
  return (await res.json()) as DriveFile;
}

async function exportText(
  file: DriveFile,
  accessToken: string
): Promise<string> {
  let url: string;

  if (file.mimeType === 'application/vnd.google-apps.document') {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.id
    )}/export?mimeType=${encodeURIComponent('text/plain')}`;
  } else if (
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json'
  ) {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.id
    )}?alt=media&supportsAllDrives=true`;
  } else {
    throw new Error(
      `Unsupported Drive file type (${file.mimeType}). Only Google Docs and text files can be imported.`
    );
  }

  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await googleError(res, 'Google Drive export failed'));
  }
  return res.text();
}

function truncateText(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

export type DriveImportResult = {
  success: true;
  note_id: number;
  file_id: string;
  title: string | null;
  text: string;
  truncated: boolean;
  already: boolean;
};

export async function importDriveDoc(
  fileIdOrUrl: string
): Promise<DriveImportResult> {
  const fileId = extractDriveFileId(fileIdOrUrl);
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new Error(
      'Google Drive is not connected. Authorize it in Settings first.'
    );
  }

  const { data: existing } = await supabase
    .from('signals')
    .select('id, value')
    .eq('name', 'note')
    .eq('source', 'google_drive')
    .filter('context->>file_id', 'eq', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const text = String((existing as any).value?.text ?? '');
    return {
      success: true,
      note_id: (existing as any).id,
      file_id: fileId,
      title: (existing as any).value?.drive_title ?? null,
      text: truncateText(text, MAX_MODEL_CHARS),
      truncated: text.length > MAX_MODEL_CHARS,
      already: true,
    };
  }

  const file = await fetchMetadata(fileId, accessToken);
  const raw = (await exportText(file, accessToken)).trim();
  if (!raw) throw new Error('The Drive document is empty.');

  const storedText = truncateText(raw, MAX_STORE_CHARS);
  const fileUrl =
    file.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
  const importedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('signals')
    .insert({
      name: 'note',
      type: 'note',
      value: {
        text: storedText,
        tags: [],
        feedbackSuggested: false,
        imported: true,
        drive_title: file.name,
        drive_url: fileUrl,
      },
      source: 'google_drive',
      context: {
        provider: 'google_drive',
        file_id: fileId,
        file_url: fileUrl,
        mime_type: file.mimeType,
        imported_at: importedAt,
        truncated: storedText.length < raw.length,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to save the Drive note: ${error.message}`);
  }

  return {
    success: true,
    note_id: data.id,
    file_id: fileId,
    title: file.name,
    text: truncateText(raw, MAX_MODEL_CHARS),
    truncated: raw.length > MAX_MODEL_CHARS,
    already: false,
  };
}

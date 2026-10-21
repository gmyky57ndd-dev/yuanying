import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import { supabase } from './db';
import {
  classifyDriveMime,
  filterCsvRows,
  inferMimeFromName,
  isSafeZipPath,
  parseCsvAll,
  parseJsonText,
  rowDate,
  stripBom,
  truncateText,
  type CsvFilter,
} from './drive-parsers';

const TOKEN_ROW_ID = 'default';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const MAX_STORE_CHARS = 200_000;
const MAX_MODEL_CHARS = 20_000;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_CSV_ROWS = 1000;
const MAX_ZIP_FILES_WITH_CONTENT = 3;

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
  size?: string;
  webViewLink?: string;
};

type FileMeta = {
  total_records: number | null;
  returned_records: number | null;
  total_chars: number;
  returned_chars: number;
  truncated: boolean;
  truncated_at: string | null;
  message: string;
  /** Text reads only: where this page started and where the next one starts. */
  offset?: number;
  next_offset?: number | null;
};

type FileResult = {
  name: string;
  format: 'text' | 'csv' | 'json';
  data: string;
  meta: FileMeta;
};

type DriveContent = {
  format: 'text' | 'csv' | 'json' | 'zip' | 'gdoc';
  storeText: string;
  data: string | FileResult[];
  meta: FileMeta & {
    total_files?: number;
    returned_files?: number;
    truncated_entries?: string[];
    skipped_entries?: string[];
  };
  details?: Record<string, unknown>;
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
  url.searchParams.set('fields', 'id,name,mimeType,size,webViewLink');
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

function buildCsvPreview(
  raw: string,
  filter: CsvFilter
): { data: string; meta: FileMeta } {
  const parsed = parseCsvAll(raw);
  const { rows, dateIndex } = filterCsvRows(parsed.headers, parsed.rows, filter);
  const header = `CSV · ${parsed.headers.length} columns · ${rows.length} matching rows\n\n`;
  const returned: string[][] = [];
  let size = header.length + 200;

  for (const row of rows) {
    if (returned.length >= MAX_CSV_ROWS) break;
    const rowSize = JSON.stringify(row).length;
    if (size + rowSize > MAX_MODEL_CHARS - 200) break;
    returned.push(row);
    size += rowSize;
  }

  const data = `${header}${JSON.stringify(
    { headers: parsed.headers, rows: returned },
    null,
    2
  )}`;
  const truncated = returned.length < rows.length;
  const truncatedAt =
    truncated && returned.length > 0 && dateIndex >= 0
      ? rowDate(returned[returned.length - 1], dateIndex)
      : null;

  return {
    data,
    meta: {
      total_records: rows.length,
      returned_records: returned.length,
      total_chars: raw.length,
      returned_chars: data.length,
      truncated,
      truncated_at: truncatedAt,
      message: truncated
        ? `Data truncated: returned ${returned.length} of ${rows.length} matching rows (limit ${MAX_CSV_ROWS} rows / ${MAX_MODEL_CHARS} chars).`
        : `All ${rows.length} matching rows returned.`,
    },
  };
}

function buildTextPreview(
  raw: string,
  format: 'text' | 'json',
  offset = 0
): { data: string; meta: FileMeta } {
  const pretty = format === 'json' ? parseJsonText(raw) : raw;
  const start = Math.max(0, Math.floor(offset) || 0);
  const slice = pretty.slice(start);
  const data = truncateText(slice, MAX_MODEL_CHARS);
  const truncated = start + data.length < pretty.length;
  const totalLines = raw.split('\n').length;
  const returnedLines = data.split('\n').length;

  let totalRecords: number | null = totalLines;
  if (format === 'json') {
    try {
      const parsed = JSON.parse(raw);
      totalRecords = Array.isArray(parsed) ? parsed.length : 1;
    } catch {
      totalRecords = null;
    }
  }

  return {
    data,
    meta: {
      total_records: totalRecords,
      returned_records: format === 'json' ? totalRecords : returnedLines,
      total_chars: raw.length,
      returned_chars: data.length,
      truncated,
      truncated_at: null,
      message: truncated
        ? `Returned characters ${start + 1}-${start + data.length} of ${pretty.length}. Call again with offset=${start + data.length} for the next page.`
        : `Complete content returned (${pretty.length} characters).`,
      offset: start,
      next_offset: truncated ? start + data.length : null,
    },
  };
}

async function readZipEntry(
  zip: JSZip,
  entryName: string
): Promise<{ entry: JSZip.JSZipObject; data: Uint8Array }> {
  const entry =
    zip.file(entryName) ??
    Object.values(zip.files).find(
      item => !item.dir && item.name.endsWith(`/${entryName}`)
    );
  if (!entry || entry.dir) {
    const available = Object.values(zip.files)
      .filter(item => !item.dir)
      .map(item => item.name)
      .join(', ');
    throw new Error(`ZIP entry not found: ${entryName}. Available: ${available}`);
  }
  const data = await entry.async('uint8array');
  return { entry, data };
}

async function readZipContent(
  buffer: Buffer,
  options: { entry?: string; filter: CsvFilter; offset?: number }
): Promise<DriveContent> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter(entry => !entry.dir);
  const readable = entries.filter(
    entry =>
      /\.(txt|md|csv|json)$/i.test(entry.name) && isSafeZipPath(entry.name)
  );

  if (options.entry) {
    const { entry, data } = await readZipEntry(zip, options.entry);
    if (data.byteLength > MAX_ZIP_FILE_BYTES) {
      throw new Error(
        `ZIP entry is too large (${data.byteLength} bytes; limit ${MAX_ZIP_FILE_BYTES}).`
      );
    }
    const raw = stripBom(new TextDecoder('utf-8').decode(data));
    const mime = inferMimeFromName(entry.name);
    const kind = classifyDriveMime(mime) ?? 'text';
    const preview =
      kind === 'csv'
        ? buildCsvPreview(raw, options.filter)
        : buildTextPreview(raw, kind === 'json' ? 'json' : 'text');
    return {
      format: kind === 'csv' ? 'csv' : kind === 'json' ? 'json' : 'text',
      storeText: truncateText(raw, MAX_STORE_CHARS),
      data: preview.data,
      meta: preview.meta,
      details: {
        zip_entry: entry.name,
        available: entries.map(item => item.name),
      },
    };
  }

  const selected = readable.slice(0, MAX_ZIP_FILES_WITH_CONTENT);
  const files: FileResult[] = [];
  const storeParts: string[] = [];
  const skipped = readable
    .slice(MAX_ZIP_FILES_WITH_CONTENT)
    .map(item => item.name);
  let totalRead = 0;
  let perFileTruncated = false;

  for (const entry of selected) {
    const rawSize = (entry as any)._data?.uncompressedSize;
    const size = typeof rawSize === 'number' ? rawSize : null;
    if (size !== null && size > MAX_ZIP_FILE_BYTES) {
      skipped.push(`${entry.name} (too large)`);
      continue;
    }
    if (totalRead >= MAX_ZIP_TOTAL_BYTES) {
      skipped.push(`${entry.name} (total size limit)`);
      continue;
    }

    const data = await entry.async('uint8array');
    if (data.byteLength > MAX_ZIP_FILE_BYTES) {
      skipped.push(`${entry.name} (too large)`);
      continue;
    }
    if (totalRead + data.byteLength > MAX_ZIP_TOTAL_BYTES) {
      skipped.push(`${entry.name} (total size limit)`);
      continue;
    }
    totalRead += data.byteLength;

    const raw = stripBom(new TextDecoder('utf-8').decode(data));
    const mime = inferMimeFromName(entry.name);
    const kind = classifyDriveMime(mime) ?? 'text';
    const format = kind === 'csv' ? 'csv' : kind === 'json' ? 'json' : 'text';
    const preview =
      format === 'csv'
        ? buildCsvPreview(raw, options.filter)
        : buildTextPreview(raw, format === 'json' ? 'json' : 'text');

    files.push({
      name: entry.name,
      format,
      data: preview.data,
      meta: preview.meta,
    });
    perFileTruncated = perFileTruncated || preview.meta.truncated;
    storeParts.push(
      `## ${entry.name}\n\n${truncateText(raw, MAX_STORE_CHARS)}`
    );
  }

  const truncatedEntries = files
    .filter(file => file.meta.truncated)
    .map(file => file.name);
  const truncated = truncatedEntries.length > 0 || skipped.length > 0;

  return {
    format: 'zip',
    storeText: storeParts.join('\n\n'),
    data: files,
    meta: {
      total_records: readable.length,
      returned_records: files.length,
      total_chars: 0,
      returned_chars: files.reduce((sum, file) => sum + file.data.length, 0),
      truncated,
      truncated_at: null,
      message: `Returned ${files.length} of ${readable.length} readable files. Truncated entries: ${
        truncatedEntries.length > 0 ? truncatedEntries.join(', ') : 'none'
      }. Skipped entries: ${skipped.length > 0 ? skipped.join(', ') : 'none'}.`,
      total_files: entries.length,
      returned_files: files.length,
      truncated_entries: truncatedEntries,
      skipped_entries: skipped,
    },
    details: {
      files: entries.map(entry => ({
        name: entry.name,
        size:
          typeof (entry as any)._data?.uncompressedSize === 'number'
            ? (entry as any)._data.uncompressedSize
            : null,
        readable: /\.(txt|md|csv|json)$/i.test(entry.name),
      })),
      skipped,
    },
  };
}

async function exportContent(
  file: DriveFile,
  accessToken: string,
  options: { entry?: string; filter: CsvFilter; offset?: number }
): Promise<DriveContent> {
  const rawMime = file.mimeType;
  const mime =
    !rawMime || rawMime === '*/*' || rawMime === 'application/octet-stream'
      ? inferMimeFromName(file.name) || rawMime
      : rawMime;

  if (mime === 'application/vnd.google-apps.document') {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      file.id
    )}/export?mimeType=${encodeURIComponent('text/plain')}`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(await googleError(res, 'Google Drive export failed'));
    }
    const raw = stripBom(await res.text());
    const preview = buildTextPreview(raw, 'text', options.offset);
    return {
      format: 'gdoc',
      storeText: truncateText(raw, MAX_STORE_CHARS),
      data: preview.data,
      meta: preview.meta,
    };
  }

  const kind = classifyDriveMime(mime);
  if (!kind) {
    throw new Error(
      `Unsupported Drive file type (${rawMime || 'unknown'}, name=${file.name}). Supported: Google Docs, txt, md, csv, json, zip.`
    );
  }

  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    file.id
  )}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(await googleError(res, 'Google Drive export failed'));
  }

  const declaredSize = Number(res.headers.get('content-length') ?? '0');
  if (declaredSize > MAX_DOWNLOAD_BYTES) {
    throw new Error(
      `Drive file is too large (${declaredSize} bytes; limit ${MAX_DOWNLOAD_BYTES}).`
    );
  }

  if (kind === 'zip') {
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `Drive file is too large (${buffer.byteLength} bytes; limit ${MAX_DOWNLOAD_BYTES}).`
      );
    }
    return readZipContent(buffer, options);
  }

  const raw = stripBom(await res.text());

  if (kind === 'csv') {
    const preview = buildCsvPreview(raw, options.filter);
    return {
      format: 'csv',
      storeText: truncateText(raw, MAX_STORE_CHARS),
      data: preview.data,
      meta: preview.meta,
    };
  }

  if (kind === 'json') {
    const preview = buildTextPreview(raw, 'json');
    return {
      format: 'json',
      storeText: truncateText(raw, MAX_STORE_CHARS),
      data: preview.data,
      meta: preview.meta,
    };
  }

  const preview = buildTextPreview(raw, 'text', options.offset);
  return {
    format: 'text',
    storeText: truncateText(raw, MAX_STORE_CHARS),
    data: preview.data,
    meta: preview.meta,
  };
}

export type DriveImportOptions = {
  entry?: string;
  offset?: number;
  start_date?: string;
  end_date?: string;
  filter_column?: string;
  filter_value?: string;
};

export type DriveImportResult = {
  success: true;
  note_id: number | null;
  file_id: string;
  title: string | null;
  format: string | null;
  data: string | FileResult[];
  meta: Record<string, unknown>;
  already: boolean;
  saved: boolean;
};

export async function importDriveDoc(
  fileIdOrUrl: string,
  options: DriveImportOptions = {}
): Promise<DriveImportResult> {
  const fileId = extractDriveFileId(fileIdOrUrl);
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new Error(
      'Google Drive is not connected. Authorize it in Settings first.'
    );
  }

  const hasOptions = !!(
    options.entry ||
    options.start_date ||
    options.end_date ||
    options.filter_column ||
    options.filter_value
  );

  const { data: existing } = await supabase
    .from('signals')
    .select('id, value')
    .eq('name', 'note')
    .eq('source', 'google_drive')
    .filter('context->>file_id', 'eq', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const file = await fetchMetadata(fileId, accessToken);
  console.log('drive file', {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size ?? null,
  });

  const filter: CsvFilter = {
    start_date: options.start_date,
    end_date: options.end_date,
    filter_column: options.filter_column,
    filter_value: options.filter_value,
  };
  const content = await exportContent(file, accessToken, {
    entry: options.entry,
    filter,
    offset: options.offset,
  });
  const storedText = content.storeText.trim();
  if (!storedText) throw new Error('The Drive document is empty.');

  const fileUrl =
    file.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
  const importedAt = new Date().toISOString();
  const effectiveMime =
    !file.mimeType ||
    file.mimeType === '*/*' ||
    file.mimeType === 'application/octet-stream'
      ? inferMimeFromName(file.name) || file.mimeType
      : file.mimeType;

  let noteId: number | null = (existing as any)?.id ?? null;

  if (!hasOptions) {
    const payload = {
      name: 'note',
      type: 'note',
      value: {
        text: truncateText(storedText, MAX_STORE_CHARS),
        tags: [],
        feedbackSuggested: false,
        imported: true,
        drive_title: file.name,
        drive_url: fileUrl,
        drive_format: content.format,
        drive_meta: content.meta,
        drive_details: content.details ?? null,
      },
      source: 'google_drive',
      context: {
        provider: 'google_drive',
        file_id: fileId,
        file_url: fileUrl,
        mime_type: file.mimeType,
        effective_mime_type: effectiveMime,
        file_size: file.size ? Number(file.size) : null,
        format: content.format,
        imported_at: importedAt,
        truncated: content.meta.truncated,
      },
    };

    if (noteId !== null) {
      const { error } = await supabase
        .from('signals')
        .update(payload)
        .eq('id', noteId);
      if (error) {
        throw new Error(`Failed to update the Drive note: ${error.message}`);
      }
    } else {
      const { data, error } = await supabase
        .from('signals')
        .insert(payload)
        .select('id')
        .single();
      if (error) {
        throw new Error(`Failed to save the Drive note: ${error.message}`);
      }
      noteId = data.id;
    }
  }

  return {
    success: true,
    note_id: noteId,
    file_id: fileId,
    title: file.name,
    format: content.format,
    data: content.data,
    meta: content.meta,
    already: !!existing,
    saved: !hasOptions,
  };
}

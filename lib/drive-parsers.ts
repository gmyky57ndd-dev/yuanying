export type DriveFormat = 'csv' | 'json' | 'zip' | 'text' | null;

export function truncateText(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

export function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

export function classifyDriveMime(mime: string): Exclude<DriveFormat, null> | null {
  if (
    mime === 'text/csv' ||
    mime === 'application/csv' ||
    mime === 'text/comma-separated-values'
  ) {
    return 'csv';
  }
  if (mime === 'application/json' || mime === 'text/json') return 'json';
  if (
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed'
  ) {
    return 'zip';
  }
  if (mime.startsWith('text/')) return 'text';
  return null;
}

export function parseCsv(text: string, maxRows: number) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = stripBom(text);

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter(r => r.some(cell => cell.trim() !== ''));
  const headers = nonEmpty.shift() ?? [];
  const dataRows = nonEmpty;
  const truncated = dataRows.length > maxRows;

  return {
    headers: headers.map(h => truncateText(h, 200)),
    rows: dataRows
      .slice(0, maxRows)
      .map(r => r.map(cell => truncateText(cell, 500))),
    total_rows: dataRows.length,
    truncated,
  };
}

export function parseJsonText(text: string): string {
  const raw = stripBom(text);
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch (e) {
    throw new Error(
      `Invalid JSON file: ${e instanceof Error ? e.message : 'parse error'}`
    );
  }
}

export function isSafeZipPath(name: string): boolean {
  const normalized = name.replace(/\\/g, '/');
  return (
    !normalized.startsWith('/') &&
    !/^[a-zA-Z]:\//.test(normalized) &&
    !normalized.split('/').includes('..') &&
    !normalized.includes('\0')
  );
}

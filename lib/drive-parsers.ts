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

export function inferMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  return '';
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

export type CsvFilter = {
  start_date?: string;
  end_date?: string;
  filter_column?: string;
  filter_value?: string;
};

export function parseCsvAll(text: string): {
  headers: string[];
  rows: string[][];
  total_rows: number;
} {
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
  return { headers, rows: nonEmpty, total_rows: nonEmpty.length };
}

export function findDateColumn(headers: string[]): number {
  return headers.findIndex(header => /date|time|created|updated/i.test(header));
}

export function rowDate(row: string[], index: number): string | null {
  if (index < 0) return null;
  const raw = String(row[index] ?? '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export function filterCsvRows(
  headers: string[],
  rows: string[][],
  filter: CsvFilter
): { rows: string[][]; dateIndex: number } {
  let filtered = rows;
  const dateIndex = findDateColumn(headers);

  if (filter.start_date || filter.end_date) {
    if (dateIndex < 0) {
      throw new Error(
        `No date column found for date filtering. Columns: ${headers.join(', ')}`
      );
    }
    const start = filter.start_date || '';
    const end = filter.end_date || '';
    filtered = filtered.filter(row => {
      const date = rowDate(row, dateIndex);
      if (!date) return false;
      return (!start || date >= start) && (!end || date <= end);
    });
  }

  if (filter.filter_column) {
    const columnIndex = headers.indexOf(filter.filter_column);
    if (columnIndex < 0) {
      throw new Error(
        `filter_column not found: ${filter.filter_column}. Columns: ${headers.join(', ')}`
      );
    }
    const raw = (filter.filter_value ?? '').trim();
    const match = raw.match(/^(<=|>=|!=|<|>|=)?\s*(.+)$/);
    const op = match?.[1] || '=';
    const target = match?.[2] ?? raw;
    const targetNumber = Number(target);

    filtered = filtered.filter(row => {
      const cell = String(row[columnIndex] ?? '').trim();
      if (op === '=') return cell.toLowerCase() === target.toLowerCase();
      if (op === '!=') return cell.toLowerCase() !== target.toLowerCase();
      const cellNumber = Number(cell);
      if (Number.isNaN(cellNumber) || Number.isNaN(targetNumber)) return false;
      switch (op) {
        case '<':
          return cellNumber < targetNumber;
        case '>':
          return cellNumber > targetNumber;
        case '<=':
          return cellNumber <= targetNumber;
        case '>=':
          return cellNumber >= targetNumber;
        default:
          return false;
      }
    });
  }

  return { rows: filtered, dateIndex };
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

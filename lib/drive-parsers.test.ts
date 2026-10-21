import { test } from 'node:test';
import assert from 'node:assert';
import {
  classifyDriveMime,
  filterCsvRows,
  inferMimeFromName,
  isSafeZipPath,
  parseCsvAll,
  parseJsonText,
  rowDate,
} from './drive-parsers.ts';

test('CSV parser handles quoted commas, quotes, and newlines', () => {
  const parsed = parseCsvAll(
    'name,note\n"a,b","line1\nline2"\n"he said ""hi""",ok\n'
  );
  assert.deepStrictEqual(parsed.headers, ['name', 'note']);
  assert.strictEqual(parsed.total_rows, 2);
  assert.deepStrictEqual(parsed.rows[0], ['a,b', 'line1\nline2']);
  assert.deepStrictEqual(parsed.rows[1], ['he said "hi"', 'ok']);
});

test('CSV date and numeric filters are push-down applied', () => {
  const parsed = parseCsvAll(
    'date,water\n2026-10-01,5\n2026-10-08,2\n2026-10-16,4\n'
  );
  const dateFiltered = filterCsvRows(parsed.headers, parsed.rows, {
    start_date: '2026-10-08',
    end_date: '2026-10-16',
  });
  assert.strictEqual(dateFiltered.rows.length, 2);
  assert.strictEqual(dateFiltered.dateIndex, 0);

  const waterFiltered = filterCsvRows(parsed.headers, parsed.rows, {
    filter_column: 'water',
    filter_value: '<3',
  });
  assert.deepStrictEqual(waterFiltered.rows, [['2026-10-08', '2']]);
});

test('rowDate parses ISO timestamps to a date', () => {
  assert.strictEqual(rowDate(['2026-10-08T23:11:00Z'], 0), '2026-10-08');
});

test('MIME classification and filename fallback', () => {
  assert.strictEqual(classifyDriveMime('text/csv'), 'csv');
  assert.strictEqual(classifyDriveMime('application/json'), 'json');
  assert.strictEqual(classifyDriveMime('application/zip'), 'zip');
  assert.strictEqual(classifyDriveMime('text/markdown'), 'text');
  assert.strictEqual(classifyDriveMime('image/png'), null);
  assert.strictEqual(inferMimeFromName('export.CSV'), 'text/csv');
  assert.strictEqual(inferMimeFromName('archive.zip'), 'application/zip');
  assert.strictEqual(inferMimeFromName('unknown.bin'), '');
});

test('JSON parser pretty-prints and rejects invalid JSON', () => {
  assert.match(parseJsonText('{"a":1}'), /"a": 1/);
  assert.throws(() => parseJsonText('{nope'), /Invalid JSON/);
});

test('ZIP path guard rejects traversal and absolute paths', () => {
  assert.strictEqual(isSafeZipPath('entries.csv'), true);
  assert.strictEqual(isSafeZipPath('nested/entries.csv'), true);
  assert.strictEqual(isSafeZipPath('../etc/passwd'), false);
  assert.strictEqual(isSafeZipPath('/etc/passwd'), false);
  assert.strictEqual(isSafeZipPath('C:/x.txt'), false);
});

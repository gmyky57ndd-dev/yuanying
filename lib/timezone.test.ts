import { test } from 'node:test';
import assert from 'node:assert';
import { getDayRange, getDateInTimezone } from './timezone.ts';

test('Asia/Shanghai day range crosses the UTC boundary at 16:00', () => {
  const r = getDayRange('2026-10-14', 'Asia/Shanghai');
  assert.strictEqual(r.start.toISOString(), '2026-10-13T16:00:00.000Z');
  assert.strictEqual(r.end.toISOString(), '2026-10-14T16:00:00.000Z');
});

test('getDateInTimezone returns the local calendar date', () => {
  // 2026-10-13T15:59:00Z is still 2026-10-13 in Shanghai (23:59).
  assert.strictEqual(
    getDateInTimezone('Asia/Shanghai', new Date('2026-10-13T15:59:00Z')),
    '2026-10-13'
  );
  // 2026-10-13T16:00:00Z is 2026-10-14 00:00 in Shanghai.
  assert.strictEqual(
    getDateInTimezone('Asia/Shanghai', new Date('2026-10-13T16:00:00Z')),
    '2026-10-14'
  );
});

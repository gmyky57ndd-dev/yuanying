import { test } from 'node:test';
import assert from 'node:assert';
import { nextScheduledAt, validateScheduleInput } from './schedule-time.ts';

test('schedule validation accepts HH:MM and rejects bad input', () => {
  assert.strictEqual(validateScheduleInput('21:30', '  write reflection  '), 'write reflection');
  assert.throws(() => validateScheduleInput('25:00', 'x'), /HH:MM/);
  assert.throws(() => validateScheduleInput('21:30', '   '), /action is required/);
  assert.throws(
    () => validateScheduleInput('21:30', 'x'.repeat(201)),
    /too long/
  );
});

test('nextScheduledAt uses the target timezone and rolls past times', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  assert.strictEqual(
    nextScheduledAt('21:30', 'America/New_York', now).toISOString(),
    '2026-10-21T01:30:00.000Z'
  );
  assert.strictEqual(
    nextScheduledAt('21:30', 'Asia/Shanghai', now).toISOString(),
    '2026-10-20T13:30:00.000Z'
  );
  assert.strictEqual(
    nextScheduledAt('09:00', 'America/New_York', now).toISOString(),
    '2026-10-20T13:00:00.000Z'
  );
  assert.strictEqual(
    nextScheduledAt(
      '09:00',
      'America/New_York',
      new Date('2026-10-20T14:00:00Z')
    ).toISOString(),
    '2026-10-21T13:00:00.000Z'
  );
});

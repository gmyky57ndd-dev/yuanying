import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeToolResult } from './tool-result.ts';

test('silent push_to_dev returns only status/issue/url', () => {
  const result = normalizeToolResult(
    'push_to_dev',
    {
      success: true,
      data: {
        issue_url: 'https://github.com/o/r/issues/54',
        number: 54,
        already: false,
      },
    },
    false
  );
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.issue_number, 54);
  assert.strictEqual(result.url, 'https://github.com/o/r/issues/54');
  assert.strictEqual(result.data, undefined);
});

test('silent get_notes returns count + titles, not full text', () => {
  const result = normalizeToolResult(
    'get_notes',
    {
      success: true,
      data: [
        { text: 'a'.repeat(200) },
        { text: 'short note' },
      ],
    },
    false
  );
  assert.strictEqual(result.data.count, 2);
  assert.strictEqual(result.data.titles.length, 2);
  assert.ok(result.data.titles[0].length <= 80);
  assert.strictEqual(result.data.titles[1], 'short note');
});

test('verbose mode truncates long results at 800 chars', () => {
  const result = normalizeToolResult(
    'read_markdown',
    { success: true, data: 'x'.repeat(2000) },
    true
  );
  assert.strictEqual(result.meta.truncated, true);
  assert.match(result.data, /\[内容已截断\]/);
  assert.ok(result.data.length < 900);
});

test('errors pass through unchanged', () => {
  const error = { success: false, error: 'Not Found' };
  assert.deepStrictEqual(normalizeToolResult('push_to_dev', error, false), error);
});

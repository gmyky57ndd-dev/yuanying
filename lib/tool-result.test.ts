import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeToolResult, stripToolMarkers } from './tool-result.ts';

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


test('external chat ingest/query summaries are bounded', () => {
  const saved = normalizeToolResult(
    'ingest_external_chat',
    { success: true, data: { id: 2, source: 'deepseek-web', chars: 230 } },
    false
  );
  assert.strictEqual(saved.data.id, 2);

  const query = normalizeToolResult(
    'query_external_chats',
    {
      success: true,
      data: [
        {
          id: 1,
          source: 'deepseek-web',
          created_at: '2026-10-21T00:00:00Z',
          content: 'x'.repeat(2000),
        },
      ],
    },
    false
  );
  assert.strictEqual(query.data.length, 1);
  assert.ok(query.data[0].excerpt.length <= 1000);
});

test('get_issue keeps a long latest comment intact', () => {
  const long = '修复说明：' + 'x'.repeat(1500);
  const result = normalizeToolResult(
    'get_issue',
    { success: true, data: { number: 73, title: 't', state: 'open', body: 'b', comments: [{ author: 'dev', body: long }] } },
    false
  );
  assert.strictEqual(result.data.latest_comments[0].body.length, long.length);
});

test('get_issue includes the latest comment bodies, not just a count', () => {
  const result = normalizeToolResult(
    'get_issue',
    {
      success: true,
      data: {
        number: 73,
        title: 'HealthConnect permission',
        state: 'open',
        labels: ['bug'],
        url: 'https://example/73',
        body: 'root cause body',
        comments: [
          { author: 'dev', body: 'first reply' },
          { author: 'dev', body: '已修复（v1.0.37）：SecurityException → no_permission' },
        ],
      },
    },
    false
  );

  assert.strictEqual(result.data.comments_count, 2);
  assert.strictEqual(result.data.latest_comments.length, 2);
  assert.match(result.data.latest_comments[1].body, /已修复/);
  assert.strictEqual(result.data.body, 'root cause body');
  assert.strictEqual(result.truncated, undefined);
});

test('get_issue stays within its bounded size', () => {
  const result = normalizeToolResult(
    'get_issue',
    {
      success: true,
      data: {
        number: 1,
        title: 'x'.repeat(50),
        state: 'open',
        body: 'b'.repeat(5000),
        comments: Array.from({ length: 20 }, (_, i) => ({
          author: 'dev',
          body: `comment ${i} ` + 'c'.repeat(2000),
        })),
      },
    },
    false
  );
  const size = JSON.stringify(result).length;
  assert.ok(size <= 5200, `expected <= 5200, got ${size}`);
});

test('get_conversation_records keeps chat snippets and timestamps', () => {
  const result = normalizeToolResult(
    'get_conversation_records',
    {
      success: true,
      data: [
        { source: 'chat', role: 'user', at: '2026-10-22T19:12:32Z', snippet: '手机上说的一句话' },
        { source: 'chat', role: 'assistant', at: '2026-10-22T19:12:33Z', snippet: '元婴的回复' },
      ],
    },
    false
  );
  assert.strictEqual(result.data.count, 2);
  assert.strictEqual(result.data.items[0].snippet, '手机上说的一句话');
  assert.strictEqual(result.data.items[0].at, '2026-10-22T19:12:32Z');
  assert.strictEqual(result.data.items[1].role, 'assistant');
});

test('read_markdown keeps the file body (#81)', () => {
  const result = normalizeToolResult(
    'read_markdown',
    {
      success: true,
      data: { path: 'core/habits.md', content: 'line one\nline two' },
      meta: { path: 'core/habits.md', truncated: false, total_chars: 17 },
    },
    false
  );
  assert.strictEqual(result.data.content, 'line one\nline two');
  assert.strictEqual(result.data.total_chars, 17);
});

test('stripToolMarkers removes leaked DSML syntax (#83)', () => {
  const dirty = '现在写 <｜｜DSML｜｜ calls> <｜｜DSML｜｜ invoke name="write_markdown"> 好了';
  const { text, hadMarkers } = stripToolMarkers(dirty);
  assert.strictEqual(hadMarkers, true);
  assert.ok(!text.includes('DSML'));
  assert.ok(!text.includes('｜｜'));
  assert.match(text, /现在写/);
});

test('stripToolMarkers removes closing DSML tags too', () => {
  const dirty = '</｜｜DSML｜｜ parameter>\n</｜｜DSML｜｜ calls>';
  const { text, hadMarkers } = stripToolMarkers(dirty);
  assert.strictEqual(hadMarkers, true);
  assert.strictEqual(text, '');
});

test('read_markdown understands the flat tool shape', () => {
  const result = normalizeToolResult(
    'read_markdown',
    { success: true, path: 'core/habits.md', text: 'hello', truncated: false, total_chars: 5 },
    false
  );
  assert.strictEqual(result.data.content, 'hello');
  assert.strictEqual(result.data.path, 'core/habits.md');
  assert.strictEqual(result.data.total_chars, 5);
});

test('read_markdown handles the wrapped { data: string, meta } shape', () => {
  const result = normalizeToolResult(
    'read_markdown',
    {
      success: true,
      data: 'line one\nline two',
      meta: { path: 'core/habits.md', total_chars: 17, truncated: false },
    },
    false
  );
  assert.strictEqual(result.data.content, 'line one\nline two');
  assert.strictEqual(result.data.path, 'core/habits.md');
});

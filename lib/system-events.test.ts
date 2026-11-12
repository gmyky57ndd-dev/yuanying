import { test } from 'node:test';
import assert from 'node:assert';
import { describeEvent, summarizeToolArgs } from './event-utils.ts';

test('tool args are structural and redact private text (#108)', () => {
  const args = summarizeToolArgs({
    path: 'local_kb/docs/a.md',
    content: 'private draft',
    query: 'very secret search',
    count: 3,
    tags: ['a', 'b'],
  });
  assert.equal(args.path, 'local_kb/docs/a.md');
  assert.equal(args.content, '<redacted:13>');
  assert.equal(args.query, '<redacted:18>');
  assert.equal(args.count, 3);
  assert.equal(args.tags, '<array:2>');
  assert.ok(!JSON.stringify(args).includes('private draft'));
});

test('diagnoses timeout vs empty vs no-tool (#108)', () => {
  const base = { id: 1, ts: '', route: '/api/chat', duration_ms: 10, error: null };
  assert.match(
    describeEvent({ ...base, status: 504, meta: { error_type: 'timeout' } }),
    /超时/
  );
  assert.match(
    describeEvent({ ...base, status: 500, meta: { error_type: 'empty_stream' } }),
    /空流/
  );
  assert.match(
    describeEvent({ ...base, status: 500, meta: { error_type: 'no_tool_call' } }),
    /未发起工具调用/
  );
  assert.match(
    describeEvent({
      ...base,
      status: 500,
      error: 'boom',
      meta: { kind: 'tool', tool: 'write_local_file', error_type: 'tool_error' },
    }),
    /工具失败：write_local_file/
  );
});

test('successful tool events name the tool (#108)', () => {
  const msg = describeEvent({
    id: 2,
    ts: '',
    route: '/api/chat/tool',
    status: 200,
    duration_ms: 42,
    error: null,
    meta: { kind: 'tool', tool: 'read_markdown' },
  });
  assert.match(msg, /工具 read_markdown 成功/);
});

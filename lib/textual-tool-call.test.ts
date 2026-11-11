import { test } from 'node:test';
import assert from 'node:assert';
import { extractTextualToolCalls } from './textual-tool-call.ts';

test('extracts a tagged object call and strips the markup', () => {
  const input = 'Sure.<tool_call>{"name":"read_local_file","arguments":{"path":"local_kb/docs/x.md"}}</tool_call>';
  const r = extractTextualToolCalls(input);
  assert.strictEqual(r.calls.length, 1);
  assert.strictEqual(r.calls[0].name, 'read_local_file');
  assert.deepStrictEqual(r.calls[0].args, { path: 'local_kb/docs/x.md' });
  assert.ok(!r.text.includes('tool_call'));
  assert.strictEqual(r.text, 'Sure.');
});

test('extracts an array of calls and the <|tool_call|> variant', () => {
  const input =
    '<tool_calls>[{"name":"a","arguments":{"x":1}},{"name":"b","parameters":{"y":2}}]</tool_calls>' +
    '<|tool_call|>{"name":"c","arguments":{}}</|tool_call|>';
  const r = extractTextualToolCalls(input);
  assert.deepStrictEqual(r.calls.map(c => c.name), ['a', 'b', 'c']);
  assert.deepStrictEqual(r.calls[1].args, { y: 2 });
  assert.strictEqual(r.text, '');
});

test('extracts a fenced json call', () => {
  const input = '```json\n{"name":"get_github_issue","arguments":{"issue_number":89}}\n```';
  const r = extractTextualToolCalls(input);
  assert.strictEqual(r.calls.length, 1);
  assert.deepStrictEqual(r.calls[0].args, { issue_number: 89 });
  assert.strictEqual(r.text, '');
});

test('leaves plain prose and ordinary code fences alone', () => {
  const input = 'Here is code:\n```js\nconsole.log(1)\n```\nDone.';
  const r = extractTextualToolCalls(input);
  assert.strictEqual(r.calls.length, 0);
  assert.ok(r.text.includes('console.log(1)'));
});

test('parses a tagged JSON function call (ES-082)', () => {
  const r = extractTextualToolCalls(
    'x<tool_call>write_local_file({"path":"local_kb/docs/a.md","content":"hi"})</tool_call>'
  );
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].name, 'write_local_file');
  assert.equal(r.calls[0].args.path, 'local_kb/docs/a.md');
});

test('parses keyword arguments inside a tagged call (ES-082)', () => {
  const r = extractTextualToolCalls(
    '<tool_call>write_markdown(path="core/x.md", content="hello")</tool_call>'
  );
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].name, 'write_markdown');
  assert.equal(r.calls[0].args.path, 'core/x.md');
  assert.equal(r.calls[0].args.content, 'hello');
});

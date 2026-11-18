import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTextualToolCalls } from './textual-tool-call.ts';

test('parses DeepSeek DSML terminal call', () => {
  const input = `<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="run_terminal_command">
<｜｜DSML｜｜ parameter name="approval_id" string="false">12</｜｜DSML｜｜ parameter>
<｜｜DSML｜｜ parameter name="project_id" string="true">yuanying</｜｜DSML｜｜ parameter>
<｜｜DSML｜｜ parameter name="argv" string="false">["node","--version"]</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>`;
  const r = extractTextualToolCalls(input);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].name, 'run_terminal_command');
  assert.deepEqual(r.calls[0].args, {
    approval_id: 12,
    project_id: 'yuanying',
    argv: ['node', '--version'],
  });
  assert.equal(r.text, '');
  assert.equal(r.hadMarkers, true);
});

test('strips DSML without a valid invoke', () => {
  const r = extractTextualToolCalls('<｜｜DSML｜｜ calls>oops</｜｜DSML｜｜ calls>');
  assert.equal(r.calls.length, 0);
  assert.equal(r.text, 'oops');
  assert.equal(r.hadMarkers, true);
});

test('parses single-bar DSML and maps command to argv', () => {
  const input = `<｜DSML｜invoke name="run_terminal_command">
<｜DSML｜parameter name="command">node --version</｜DSML｜parameter>
<｜DSML｜parameter name="approval_id">8</｜DSML｜parameter>
<｜DSML｜parameter name="project_id">yuanying</｜DSML｜parameter>
</｜DSML｜invoke>`;
  const r = extractTextualToolCalls(input);
  assert.equal(r.calls.length, 1);
  assert.deepEqual(r.calls[0].args, {
    approval_id: 8,
    project_id: 'yuanying',
    argv: ['node', '--version'],
  });
});

test('parses malformed single-bar DSML with missing angle bracket', (): void => {
  const r = extractTextualToolCalls('｜DSML｜invoke name="get_github_issue">\n106\n</parameter>\n</invoke>');
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].name, 'get_github_issue');
  assert.equal(r.calls[0].args.issue_number, 106);
  assert.equal(r.text, '');
});

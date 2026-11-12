import { test } from 'node:test';
import assert from 'node:assert';
import { readMailbox, writeMailbox } from './mailbox.ts';

test('mailbox reads a local file and rejects unsafe paths', async () => {
  const result = await readMailbox('mailbox/README.md');
  assert.match(result.data.text, /Yuanying Mailbox/);

  for (const bad of [
    '../etc/passwd',
    '/etc/passwd',
    'docs/specs/x.sh',
    'mailbox/evil.exe',
  ]) {
    await assert.rejects(() => readMailbox(bad), /Unsafe|must start|Only|绝对路径/);
    await assert.rejects(() => writeMailbox(bad, 'x'), /Unsafe|must start|Only|绝对路径/);
  }

  // Repo docs are read-only; docs/pm/ is the writable area.
  await assert.rejects(() => writeMailbox('docs/specs/x.md', 'x'), /只读/);
});

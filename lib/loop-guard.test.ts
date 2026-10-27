import { test } from 'node:test';
import assert from 'node:assert';
import {
  hasSaveQuestion,
  stripSaveQuestion,
  recentSaveQuestionCount,
} from './loop-guard.ts';

test('detects the save question variants', () => {
  assert.ok(hasSaveQuestion('要我存下来吗？'));
  assert.ok(hasSaveQuestion('要我把这段存起来吗?'));
  assert.ok(!hasSaveQuestion('今天先到这里。'));
});

test('strips the question but keeps the rest', () => {
  const text = '昨天你把 PSD 做完了。\n要我存下来吗？';
  const out = stripSaveQuestion(text);
  assert.match(out, /PSD/);
  assert.ok(!hasSaveQuestion(out));
});

test('counts repeated questions in recent assistant turns', () => {
  const history = [
    { role: 'assistant', content: '今天很安静。要我存下来吗？' },
    { role: 'user', content: '别问了' },
    { role: 'assistant', content: '要我把这段存下来吗？' },
  ];
  assert.strictEqual(recentSaveQuestionCount(history), 2);
});

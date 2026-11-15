import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyModelError } from './failover-policy.ts';

function statusError(status: number): Error {
  const e = new Error(`HTTP ${status}`) as Error & { statusCode: number };
  e.statusCode = status;
  return e;
}

test('429 is retryable', () => {
  assert.equal(classifyModelError(statusError(429)).retryable, true);
});
test('5xx is retryable', () => {
  assert.equal(classifyModelError(statusError(503)).retryable, true);
});
test('400 is not retryable', () => {
  assert.equal(classifyModelError(statusError(400)).retryable, false);
});
test('401 is not retryable', () => {
  assert.equal(classifyModelError(statusError(401)).retryable, false);
});
test('404 is not retryable', () => {
  assert.equal(classifyModelError(statusError(404)).retryable, false);
});
test('network/timeout is retryable', () => {
  assert.equal(
    classifyModelError(new Error('Cannot connect to API: bad port')).retryable,
    true
  );
  assert.equal(classifyModelError(new Error('The operation was aborted')).retryable, true);
});

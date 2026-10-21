import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

function read(path: string): string {
  return fs.readFileSync(path, 'utf-8');
}

test('ES-039 daily summary rules are present', () => {
  const src = read('lib/summary-generator.ts');
  assert.match(src, /绝对不能使用带点号的列表/);
  assert.match(src, /先读 notes/);
  assert.match(src, /不给任何未经请求的健康建议/);
});

test('ES-043 service worker bypasses API and uses cache v3', () => {
  const src = read('public/sw.js');
  assert.match(src, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(src, /CACHE_NAME = 'yuanying-v3'/);
});

test('ES-044/045/046 chat route has timeout, reset, and tool lifecycle guards', () => {
  const src = read('app/api/chat/route.ts');
  assert.match(src, /maxDuration = 60/);
  assert.match(src, /chat_reset_at/);
  assert.match(src, /status: 'sending'/);
  assert.match(src, /type: 'push_to_dev'/);
  assert.match(src, /enqueuePushToDev/);
  assert.match(src, /write_markdown/);
  assert.match(src, /scheduler/);
});

test('ES-043/044/046 client handles 504 and push failures', () => {
  const src = read('lib/api.ts');
  assert.match(src, /服务器处理超时，请重试/);
  assert.match(src, /GitHub Issue 未创建/);
  assert.match(src, /Array\.isArray\(data\)/);
});

test('manifest documents write_markdown and scheduler limits', () => {
  const src = read('core/system-manifest.md');
  assert.match(src, /write_markdown/);
  assert.match(src, /scheduler\(time, action\)/);
});

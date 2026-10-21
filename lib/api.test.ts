import { test } from 'node:test';
import assert from 'node:assert';
import { postChat } from './api.ts';

function streamResponse(body: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

test('postChat returns streamed text', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => streamResponse('0:"hello"\n')) as typeof fetch;
  try {
    const result = await postChat('hi');
    assert.strictEqual(result.reply, 'hello');
  } finally {
    globalThis.fetch = previous;
  }
});

test('postChat throws on 504 with an explicit timeout message', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('timeout', { status: 504 })) as typeof fetch;
  try {
    await assert.rejects(() => postChat('hi'), /服务器处理超时/);
  } finally {
    globalThis.fetch = previous;
  }
});

test('postChat surfaces push_to_dev data-part failures', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () =>
    streamResponse(
      '0:"sending"\n2:[{"type":"push_to_dev","success":false,"error":"Not Found"}]\nd:{"finishReason":"stop"}\n'
    )) as typeof fetch;
  try {
    await assert.rejects(
      () => postChat('send this to dev'),
      /GitHub Issue 未创建：Not Found/
    );
  } finally {
    globalThis.fetch = previous;
  }
});


test('postChat accepts an assistant_text fallback when the stream has no text', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () =>
    streamResponse(
      '2:[{"type":"assistant_text","text":"fallback reply"}]\nd:{"finishReason":"stop"}\n'
    )) as typeof fetch;
  try {
    const result = await postChat('hi');
    assert.strictEqual(result.reply, 'fallback reply');
  } finally {
    globalThis.fetch = previous;
  }
});

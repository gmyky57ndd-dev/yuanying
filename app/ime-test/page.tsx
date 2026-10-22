'use client';

/**
 * ES-056 minimal isolation page. No chat state, no polling, no layout logic:
 * if the Gboard 更改键盘 popup survives here but not in the chat, the cause is
 * in the chat page; if it fails here too, it is Chrome/Gboard + this origin.
 */
export default function ImeTestPage() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        background: '#0c0a09',
        color: '#e7e5e4',
        fontSize: 14,
      }}
    >
      <p>
        输入法测试页：点下面的框 → 键盘弹出 → 点「拼音」，看「更改键盘」是否停留。
        上面是 textarea，下面是 input。
      </p>
      <textarea
        placeholder="textarea"
        style={{ padding: 12, minHeight: 90, borderRadius: 12 }}
      />
      <input placeholder="input" style={{ padding: 12, borderRadius: 12 }} />
    </div>
  );
}

'use client';

/**
 * ES-056 isolation page (no chat state, no polling, no layout logic).
 *
 * Field 1 has no `lang`. Field 2 declares en-US, field 3 zh-CN. If Gboard
 * honours the field language, tapping field 2 should bring up an English
 * keyboard directly — which would give us a working 中/EN switch that does not
 * depend on the (broken) 更改键盘 popup.
 */
export default function ImeTestPage() {
  const box: React.CSSProperties = {
    padding: 12,
    minHeight: 70,
    borderRadius: 12,
    background: '#fff',
    color: '#000',
  };
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 14,
        background: '#0c0a09',
        color: '#e7e5e4',
        fontSize: 13,
      }}
    >
      <p>1) 无 lang — 预期中文键盘</p>
      <textarea placeholder="no lang" style={box} />

      <p>2) lang=en-US — 若生效，键盘应直接是英文</p>
      <textarea placeholder="lang=en-US" lang="en-US" style={box} />

      <p>3) lang=zh-CN</p>
      <textarea placeholder="lang=zh-CN" lang="zh-CN" style={box} />

      <p>4) input lang=en-US（单行控件对照）</p>
      <input placeholder="input en-US" lang="en-US" style={box} />

      <p style={{ color: '#a8a29e' }}>
        每个框点一次，看键盘语言是否不同、以及点「拼音」时弹层是否停留。
      </p>
    </div>
  );
}

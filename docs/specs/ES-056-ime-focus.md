# ES-056 — Remove Language Toggle & Fix PWA IME Focus

- **Status:** Urgent Bug (P0) — owner: the OS IME cannot switch zh/en inside the
  PWA input; must leave the app, switch, and come back.
- **Tracking:** P2-34. Supersedes the toggle decision in ES-055 §2.4.
- **Rule:** no fake controls, and never intercept the native IME.

## 1. What was checked

| Suspect | Finding |
|---|---|
| Global `keydown` / `keypress` with `preventDefault()` | Only the ⌘/Ctrl+Shift+V clipboard handler, and it returns early for every other key. **Not the cause.** |
| `contenteditable="true"` | Not used. |
| CSS `user-select: none` / `pointer-events: none` on the input | Not present in `app/globals.css`, `tailwind.config.ts`, or the composer. |
| `lang="zh-CN"` **on the input** | **Present.** It pins the IME language hint per field; on Gboard this can make the globe/long-press switch appear inert inside that field. Removed. |
| Re-render during composition | `onCompositionStart` called `setComposing(true)`, forcing a React re-render mid-composition. Replaced with a ref (no render). |
| Single-line `<input>` | Android WebViews handle IME better in a native multi-line control, and the product needs long notes. Replaced with `<textarea>`. |

## 2. Changes

- **Toggle removed** (`中/EN` button and its persisted `yy_input_lang` state are gone).
- **Composer is now `<textarea rows={1}>`**: auto-grows to 120 px, Enter sends,
  Shift+Enter inserts a newline, `enterKeyHint="send"`.
- **No `lang` attribute on the field**; `autoComplete="off"`, `spellCheck={false}`
  only — nothing tells the IME which language to lock to.
- **No state updates during composition**: `composingRef` guards the Enter
  handler; `keyCode === 229` and `nativeEvent.isComposing` are respected.
- **No global key interception** other than the explicit clipboard shortcut.

## 3. Manifest

`core/system-manifest.md` gains:

```md
## 语言输入
- 元婴不控制输入法。用户直接在键盘上使用系统自带的输入法切换功能。
- 界面里没有 中/EN 按钮，也没有任何代码拦截输入法；这是设计，不是故障。
- 输入框是原生 <textarea>，Enter 发送，Shift+Enter 换行。
```

## 4. Acceptance

- [ ] No 中/EN button anywhere in the UI.
- [ ] In the installed Android PWA, tapping the field and using the keyboard's
      own language key switches zh/en without leaving the app.
- [ ] Long text scrolls inside the composer (max 120 px) with no focus loss;
      Enter sends, Shift+Enter adds a line.
- [ ] Sending a message keeps the keyboard open and the caret in the field.

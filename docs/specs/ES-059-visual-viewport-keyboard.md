# ES-059 — VisualViewport Fix for Keyboard Occlusion & IME Dismissal

- **Status:** P0 (execute now; no more test environments).
- **Category:** Bug (Frontend mobile viewport).
- **Supersedes:** ES-056 layout experiments. Refs: P2-34, P2-35.

## 1. Root cause (owner's debug log, 2026-10-21 22:49)

```
resize h=725 vv=442   ← keyboard opened
resize h=725 vv=726   ← keyboard dismissed
```

`h` is the layout viewport (unchanged by the keyboard); `vv` is the visual
viewport. The app container was sized to the layout viewport, so with the
keyboard open the bottom composer sat **underneath it**; the browser kept
correcting the scroll, the IME connection was reset, and the Gboard 更改键盘
popup was dismissed. Any IME height change (opening the language picker) made it
worse.

## 2. Fix (option B, the only layout mode now)

- `app/page.tsx` keeps `--app-h` in sync with `window.visualViewport.height`
  (`resize` + `scroll` + `orientationchange` + window `resize`), applied on
  mount.
- The root container is `fixed inset-x-0 top-0`, `height: var(--app-h, 100dvh)`,
  `display:flex; flex-direction:column; overflow:hidden`.
- The message list is `flex:1; overflow-y:auto`; the composer stays pinned at
  the bottom of the *visual* viewport, above the keyboard.
- The experimental `fixed` vs `vv` switch, the `?diag=1` overlay, the
  `focusin`/`focusout` logging, the Settings debug buttons and `/ime-test` are
  **deleted**.

## 3. Acceptance

- [ ] Tapping the composer opens the keyboard and the composer stays visible
      directly above it (no layout viewport scrolling).
- [ ] Tapping 拼音 shows 更改键盘 and it stays until a language is chosen.
- [ ] Switching languages does not dismiss the keyboard.
- [ ] No debug UI or logging ships (no `?diag=1`, no `/ime-test`).

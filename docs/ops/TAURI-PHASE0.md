# Tauri Phase 0 (Desktop shell)

## What it is

A thin macOS shell that owns a local Next.js server and points its webview at
`http://127.0.0.1:3100/desktop`. No Tailscale/Funnel hop for desktop.

- Rust shell: `src-tauri/src/main.rs`
- Config: `src-tauri/tauri.conf.json`
- Runtime builder: `scripts/tauri-build-runtime.sh`
- Build: `npm run tauri:build` (or `npx tauri build --bundles app`)

## Build details

- Next standalone output (`NEXT_OUTPUT=standalone`)
- Official Node **v22.14.0** binary (Homebrew Node links `libnode` dynamically
  and cannot be copied alone)
- Runtime pruned to server + `.next` + `node_modules` + `core` + `public`
  (~268 MB; app ~279 MB)
- `.env.local` is copied into the bundle (local unsigned app only; never share
  the `.app`)

## Behavior

- Fixed port **3100**; if occupied the app exits with
  `[yuanying] port 3100 is already in use`.
- Health check `/api/health` (40s timeout) before the window opens.
- Closing/Cmd+Q kills the Node sidecar (verified: port free after quit).
- Logs: `~/Library/Logs/com.yuanying.desktop/desktop.log`.

## Verified (Phase 0, 2026-11-12)

```
cold start (open → /api/health 200): 2.91s
webview connected: 127.0.0.1:50782 -> 127.0.0.1:3100 (ESTABLISHED)
port conflict: exit 1, clear message
quit: app=0 node=0, port 3100 free
.app: src-tauri/target/release/bundle/macos/Yuanying.app (279 MB, ad-hoc signed)
```

## Not in Phase 0

- Signing/notarization, updater, menu bar, dynamic port, bundled secrets in
  Keychain, SQLite local-first data (Phase 2).

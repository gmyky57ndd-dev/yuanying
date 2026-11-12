# Tauri Phase 1.5 — secrets outside the bundle, signing

## Secrets

`.env.local` is **no longer copied into the .app**. The shell reads
`~/Library/Application Support/com.yuanying.desktop/secrets.env` (0600) and
passes it to the Node sidecar.

```
./scripts/tauri-secrets-setup.sh   # copies .env.local → Application Support (0600)
```

Verified: rebuilt `.app` contains no `.env.local` / `secrets.env`; `/api/health`
returns 200 with the external file; quit kills the sidecar.

### Keychain status

`security find-generic-password` and `codesign` **hang/fail** because the login
keychain is locked (`security show-keychain-info` also hangs; codesign returns
`errSecInternalComponent`). Keychain support is therefore not enabled; the
Application Support file is the fallback. To switch later:

1. unlock the login keychain in Keychain Access (or
   `security unlock-keychain`);
2. store the env with `scripts/tauri-keychain-setup.sh` (base64);
3. re-enable the keychain reader in `src-tauri/src/main.rs`.

## Signing

- Identity: `Apple Development: zhangalex157@gmail.com (NMZ6KMVPT7)`,
  SHA-1 `2AC23BE07738F2C240A3993C36975AB13D177424`.
- `scripts/tauri-sign.sh` (defaults to the hash) signs the app and nested Node
  binary after `npm run tauri:build`.
- Verified:

```
Identifier=com.yuanying.desktop
TeamIdentifier=Z2GMF897Z7
codesign --verify --deep --strict  → OK
nested node signed                  → OK
app launch /api/health              → 200
```

- **Not notarized**: `spctl --assess` still rejects. Notarization requires a
  `Developer ID Application` certificate and Apple ID / app-specific password /
  team credentials, none of which are on this Mac.

## Current status

- App: Apple Development signed, 275 MB, health 200.
- Secrets: external 0600 file.
- Notarization: blocked on Developer ID credentials (owner action).

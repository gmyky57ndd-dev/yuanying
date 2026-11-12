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

## Signing (local self-use)

This app is for this Mac only. **Ad-hoc signing is sufficient**:

```
codesign --force --deep --sign - Yuanying.app
```

`scripts/tauri-sign.sh` defaults to `-` (ad-hoc); set
`APPLE_SIGNING_IDENTITY` only if the app will be shared with another Mac.
No Apple account, Developer ID, or notarization is required.

Verified:

```
Signature=adhoc
codesign --verify --deep --strict → OK
app launch /api/health → 200
quit → node=0
```

## Current status

- App: ad-hoc signed, 275.9 MB, health 200.
- Secrets: external 0600 file.
- Notarization/Developer ID: **not needed** for local use.

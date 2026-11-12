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

- Identity available: `Apple Development: zhangalex157@gmail.com (NMZ6KMVPT7)`.
- `scripts/tauri-sign.sh` signs the app if the keychain is unlocked.
- **Not notarized**: there is no `Developer ID Application` identity and no
  Apple ID/team credentials in this environment. `spctl --assess` will reject
  the app until it is signed with Developer ID and notarized.

## Current status

- App: ad-hoc signed, 275 MB, health 200.
- Secrets: external 0600 file.
- Signing/notarization: **blocked** on unlocked keychain + Developer ID
  credentials (owner action).

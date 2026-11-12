#!/usr/bin/env bash
# Sign the local .app with an Apple identity (not notarized).
# Requires the login keychain to be unlocked; otherwise codesign fails with
# errSecInternalComponent.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src-tauri/target/release/bundle/macos/Yuanying.app"
# Local/self-use: ad-hoc. Set APPLE_SIGNING_IDENTITY only when sharing.
IDENTITY="${APPLE_SIGNING_IDENTITY:--}"

if [ ! -d "$APP" ]; then
  echo "app not built: $APP" >&2
  exit 1
fi
if [ "$IDENTITY" != "-" ] && ! security find-identity -v -p codesigning | grep -qF "$IDENTITY"; then
  echo "signing identity not found: $IDENTITY" >&2
  exit 1
fi
codesign --force --deep --sign "$IDENTITY" "$APP"
codesign --verify --deep --strict "$APP"
echo "signed: $IDENTITY"

#!/usr/bin/env bash
# Sign the local .app with an Apple identity (not notarized).
# Requires the login keychain to be unlocked; otherwise codesign fails with
# errSecInternalComponent.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src-tauri/target/release/bundle/macos/Yuanying.app"
IDENTITY="${APPLE_SIGNING_IDENTITY:-2AC23BE07738F2C240A3993C36975AB13D177424}"

if [ ! -d "$APP" ]; then
  echo "app not built: $APP" >&2
  exit 1
fi
if ! security find-identity -v -p codesigning | grep -qF "$IDENTITY"; then
  echo "signing identity not found: $IDENTITY" >&2
  exit 1
fi
codesign --force --deep --sign "$IDENTITY" "$APP"
codesign --verify --deep --strict "$APP"
echo "signed: $IDENTITY (not notarized)"

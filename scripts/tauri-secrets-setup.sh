#!/usr/bin/env bash
# Store the runtime secrets outside the .app bundle.
# Keychain is blocked while the login keychain is locked (security(1) prompts
# and cannot complete headlessly), so use a 0600 file in Application Support.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/com.yuanying.desktop"
mkdir -p "$DEST"
cp "$ROOT/.env.local" "$DEST/secrets.env"
chmod 600 "$DEST/secrets.env"
echo "secrets: $DEST/secrets.env (0600)"

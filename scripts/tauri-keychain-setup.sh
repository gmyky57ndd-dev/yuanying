#!/usr/bin/env bash
# Store .env.local in the macOS Keychain for the Tauri app (no secrets in .app).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE="com.yuanying.desktop.env"
if [ ! -f "$ROOT/.env.local" ]; then
  echo ".env.local not found" >&2
  exit 1
fi
# -A: allow the (ad-hoc/dev-signed) app to read without an ACL prompt.
VALUE="$(base64 < "$ROOT/.env.local" | tr -d '\n')"
/usr/bin/security add-generic-password -U -A \
  -a "$USER" -s "$SERVICE" -w "$VALUE" >/dev/null
echo "stored $SERVICE in Keychain"

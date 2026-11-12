#!/usr/bin/env bash
# Phase 2: flush local outbox (offline note/config/signal writes) to Supabase.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRET="$(sed -n 's/^CRON_SECRET=//p' "$ROOT/.env.local" | tr -d '\r\n')"
if [ -z "$SECRET" ]; then
  echo "CRON_SECRET missing" >&2
  exit 1
fi
# Prefer the bridge (:3000); fall back to the Tauri sidecar (:3100).
for port in 3000 3100; do
  if curl -fsS -m 30 -X POST "http://127.0.0.1:${port}/api/sync/flush" \
    -H "Authorization: Bearer ${SECRET}" -H 'Content-Type: application/json' -d '{}'; then
    echo
    exit 0
  fi
done
echo "sync: no local server on :3000 or :3100" >&2
exit 1

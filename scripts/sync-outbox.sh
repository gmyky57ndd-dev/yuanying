#!/usr/bin/env bash
# Phase 2: flush local outbox (offline note/config/signal writes) to Supabase.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRET="$(sed -n 's/^CRON_SECRET=//p' "$ROOT/.env.local" | tr -d '\r\n')"
if [ -z "$SECRET" ]; then
  echo "CRON_SECRET missing" >&2
  exit 1
fi
curl -fsS -m 30 -X POST "http://localhost:3000/api/sync/flush" \
  -H "Authorization: Bearer ${SECRET}" -H 'Content-Type: application/json' -d '{}'
echo

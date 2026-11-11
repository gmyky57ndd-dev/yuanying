#!/usr/bin/env bash
# Issue #95: flip pushed feedback to resolved when its GitHub issue closes.
# Invoked by launchd every 30 minutes (com.yuanying.feedback).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRET="$(sed -n 's/^CRON_SECRET=//p' "$ROOT/.env.local" | tr -d '\r\n')"
if [ -z "$SECRET" ]; then
  echo "CRON_SECRET missing in $ROOT/.env.local" >&2
  exit 1
fi
curl -fsS -m 60 -X POST "http://localhost:3000/api/cron/feedback-sync" \
  -H "Authorization: Bearer ${SECRET}" \
  -H 'Content-Type: application/json' -d '{}'
echo

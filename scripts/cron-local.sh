#!/usr/bin/env bash
# ES-076: local evening-summary trigger while Vercel is paused.
# Usage: cron-local.sh [--force]
#   no arg   → the endpoint's 21:00–22:00 local guard + idempotency apply
#   --force  → bypass the guard and idempotency for a manual test
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRET="$(sed -n 's/^CRON_SECRET=//p' "$ROOT/.env.local" | tr -d '\r\n')"
if [ -z "$SECRET" ]; then
  echo "CRON_SECRET missing in $ROOT/.env.local" >&2
  exit 1
fi
FORCE=""
if [ "${1:-}" = "--force" ]; then FORCE="?force=1"; fi
curl -fsS -m 90 -X POST "http://localhost:3000/api/cron/evening-summary${FORCE}" \
  -H "Authorization: Bearer ${SECRET}" \
  -H 'Content-Type: application/json' -d '{}'
echo

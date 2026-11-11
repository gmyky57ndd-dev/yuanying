#!/usr/bin/env bash
# ES-076 / deploy hardening: bring the local bridge up atomically.
#
# The old flow restarted `next start` while `.next` was being rewritten, which
# left the server serving HTML that referenced a chunk from another build (a
# blank desktop page). New flow:
#   1. build into .next-staging (the live server keeps serving .next)
#   2. stop the launchd job and free :3000
#   3. swap .next <-> .next-staging
#   4. start the job and verify /api/health AND the /desktop page chunk
#   5. roll back to .next.prev if the health check fails
#
# Usage:
#   ./scripts/bridge-up.sh              # build + deploy
#   ./scripts/bridge-up.sh --no-build   # restart the current build only
set -uo pipefail
cd "$(dirname "$0")/.."

PORT=3000
JOB="com.yuanying.web"
PLIST="$HOME/Library/LaunchAgents/$JOB.plist"
LOG=/tmp/yy-web.log
LOCK=/tmp/yy-bridge-deploy.lock
BUILD=1
case "${1:-}" in
  --no-build|--fast) BUILD=0 ;;
  -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
esac

say() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*"; }

if ! mkdir "$LOCK" 2>/dev/null; then
  say "another deploy holds $LOCK; aborting"
  exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

listener_pids() { lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true; }

stop_web() {
  launchctl bootout "gui/$(id -u)/$JOB" 2>/dev/null || true
  for _ in $(seq 1 20); do
    [ -z "$(listener_pids)" ] && return 0
    sleep 0.5
  done
  local pids; pids="$(listener_pids)"
  if [ -n "$pids" ]; then
    say "forcing stale listener(s): $pids"
    kill $pids 2>/dev/null || true
    sleep 2
    pids="$(listener_pids)"
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  fi
}

start_web() {
  local err=/tmp/yy-bootstrap.err
  for _ in 1 2 3; do
    if launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>"$err"; then
      return 0
    fi
    if launchctl print "gui/$(id -u)/$JOB" >/dev/null 2>&1; then
      launchctl kickstart -k "gui/$(id -u)/$JOB" 2>>"$err" && return 0
    fi
    sleep 1
  done
  say "WARN: launchd start failed ($(tr '\n' ' ' <"$err" | cut -c1-160))"
  # KeepAlive would fight a nohup child; unload before the fallback.
  launchctl bootout "gui/$(id -u)/$JOB" 2>/dev/null || true
  nohup npm run start >>"$LOG" 2>&1 &
}

health() {
  for _ in $(seq 1 40); do
    if curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1 || return 1
  # The exact blank-page failure: HTML references a chunk that 404s.
  local html chunk
  html="$(curl -fsS "http://localhost:$PORT/desktop" 2>/dev/null)" || return 1
  chunk="$(printf '%s' "$html" | grep -o '/_next/static/chunks/app/desktop/[^"]*\.js' | head -1)"
  [ -n "$chunk" ] || { say "no desktop chunk in HTML"; return 1; }
  curl -fsS "http://localhost:$PORT$chunk" >/dev/null 2>&1 || {
    say "desktop chunk 404: $chunk"
    return 1
  }
  return 0
}

if [ "$BUILD" = 1 ]; then
  say "building into .next-staging (live server keeps running)…"
  rm -rf .next-staging
  if ! NEXT_DIST_DIR=.next-staging npm run build; then
    say "BUILD FAILED — live server untouched"
    rm -rf .next-staging
    exit 1
  fi
fi

if [ "$BUILD" = 1 ]; then
  say "stopping ${JOB}…"
  stop_web
  rm -rf .next.prev
  mv .next .next.prev
  mv .next-staging .next
fi

say "starting ${JOB}…"
start_web

if health; then
  say "OK: :$PORT healthy, desktop chunk served"
else
  say "HEALTH FAILED — rolling back"
  stop_web
  if [ "$BUILD" = 1 ] && [ -d .next.prev ]; then
    rm -rf .next.failed
    mv .next .next.failed
    mv .next.prev .next
  fi
  start_web
  say "rolled back; see $LOG and /tmp/yy-web.err"
  exit 1
fi

# Tailscale funnel: reuse the launchd daemon socket (never start a second state).
TS_SOCKET="${TS_SOCKET:-$HOME/.yy-bridge/sock}"
if ! tailscale --socket="$TS_SOCKET" status >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/com.yuanying.tailscaled" 2>/dev/null || true
  for _ in $(seq 1 10); do
    tailscale --socket="$TS_SOCKET" status >/dev/null 2>&1 && break
    sleep 1
  done
fi
if tailscale --socket="$TS_SOCKET" status >/dev/null 2>&1; then
  tailscale --socket="$TS_SOCKET" funnel --bg "$PORT" >/dev/null 2>&1 || true
  say "bridge: https://yuanying-bridge-1.taila5ffe0.ts.net"
else
  say "WARN: tailscale socket $TS_SOCKET unavailable; funnel not re-armed"
fi

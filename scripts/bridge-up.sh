#!/usr/bin/env bash
# ES-076: bring the local bridge back after a reboot.
# Usage: ./scripts/bridge-up.sh
set -uo pipefail
cd "$(dirname "$0")/.."

if ! lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "starting next server…"
  nohup npm run start >/tmp/yy-server.log 2>&1 &
  sleep 6
fi

if ! tailscale --socket=/tmp/ts/sock status >/dev/null 2>&1; then
  echo "starting tailscaled…"
  nohup tailscaled --tun=userspace-networking \
    --state=/tmp/ts/state --statedir=/tmp/ts/var --socket=/tmp/ts/sock \
    --port=41641 --socks5-server=localhost:1055 \
    --outbound-http-proxy-listen=localhost:1056 >/tmp/yy-tailscaled.log 2>&1 &
  sleep 4
  tailscale --socket=/tmp/ts/sock up --hostname=yuanying-bridge --accept-dns=false
fi

tailscale --socket=/tmp/ts/sock funnel --bg 3000
echo "bridge: https://yuanying-bridge.taila5ffe0.ts.net"

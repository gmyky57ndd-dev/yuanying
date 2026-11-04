#!/usr/bin/env bash
# ES-076: keep a serveo reverse tunnel alive. Once the SSH key is registered,
# the subdomain stays stable (yuanying-bridge.serveo.net).
set -uo pipefail
KEY="$HOME/.ssh/id_serveo"
while true; do
  echo "[$(date)] starting tunnel"
  ssh -i "$KEY" \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/tmp/yy_known_hosts \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -R yuanying-bridge:80:localhost:3000 serveo.net
  echo "[$(date)] tunnel exited ($?); retrying in 5s"
  sleep 5
done

#!/usr/bin/env bash
# Phase 0: build the Next standalone server + bundled Node runtime for Tauri.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

rm -rf .next
NEXT_OUTPUT=standalone npm run build

rm -rf desktop-runtime
mkdir -p desktop-runtime/.next
cp -R .next/standalone/. desktop-runtime/
cp -R .next/static desktop-runtime/.next/static
cp -R public desktop-runtime/public
cp .env.local desktop-runtime/.env.local 2>/dev/null || true

# Homebrew Node links libnode dynamically; use the official self-contained binary.
NODE_VERSION="v22.14.0"
CACHE="$HOME/.cache/yuanying"
mkdir -p "$CACHE"
NODE_BIN="$CACHE/node-$NODE_VERSION"
if [ ! -x "$NODE_BIN" ]; then
  echo "downloading Node ${NODE_VERSION}…"
  curl -fsSL -o "$CACHE/node.tar.gz" \
    "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-arm64.tar.gz"
  tar xzf "$CACHE/node.tar.gz" -C "$CACHE"
  cp "$CACHE/node-$NODE_VERSION-darwin-arm64/bin/node" "$NODE_BIN"
  chmod +x "$NODE_BIN"
fi
cp "$NODE_BIN" desktop-runtime/node
chmod +x desktop-runtime/node

# Standalone tracing can pull the whole repo (collector, src-tauri, docs); keep
# only what the server reads at runtime.
rm -rf desktop-runtime/{src-tauri,collector,backups,docs,index,supabase,app,lib,components,scripts,.git,desktop-runtime} \
  desktop-runtime/tsconfig.tsbuildinfo

echo "desktop-runtime: $(du -sh desktop-runtime | cut -f1)"
echo "node: $NODE_BIN"

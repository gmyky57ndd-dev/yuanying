#!/usr/bin/env bash
# Phase 0: build the Next standalone server + bundled Node runtime for Tauri.
# The build runs in a temp copy so it never clobbers the live .next on :3000
# and never traces src-tauri/target or the Android collector into the server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yuanying-build.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "building standalone in $TMP_DIR"
rsync -a \
  --exclude '/node_modules' --exclude '/.next' --exclude '/.git' \
  --exclude '/src-tauri' --exclude '/collector' --exclude '/desktop-runtime' \
  --exclude '/backups' --exclude '/docs' --exclude '/*.log' --exclude '/.env*' \
  "$ROOT/" "$TMP_DIR/"
cp -R "$ROOT/node_modules" "$TMP_DIR/node_modules"
cp "$ROOT/.env.local" "$TMP_DIR/.env.local" 2>/dev/null || true

cd "$TMP_DIR"
NEXT_OUTPUT=standalone npm run build

cd "$ROOT"
rm -rf desktop-runtime
mkdir -p desktop-runtime/.next
cp -R "$TMP_DIR/.next/standalone/." desktop-runtime/
cp -R "$TMP_DIR/.next/static" desktop-runtime/.next/static
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

# Keep only what the server reads at runtime.
rm -rf desktop-runtime/{src-tauri,collector,backups,docs,index,supabase,app,lib,components,scripts,.git,desktop-runtime}

echo "desktop-runtime: $(du -sh desktop-runtime | cut -f1)"

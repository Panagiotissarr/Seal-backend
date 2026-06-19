#!/bin/bash

cd /home/container

echo "=== Step 1: Backup .env and config/ ==="
BACKUP_DIR=$(mktemp -d)

if [ -f .env ]; then
  cp .env "$BACKUP_DIR/env" && echo "  .env backed up" || echo "  WARN: could not backup .env"
fi
if [ -d config ]; then
  cp -r config "$BACKUP_DIR/config" && echo "  config/ backed up" || echo "  WARN: could not backup config/"
fi

echo "=== Step 2: Sync from GitHub ==="
if [ -d .git ]; then
  echo "  Updating existing repo..."
  git fetch --all
  git reset --hard origin/main
  git clean -fd
  echo "  Repo updated"
else
  echo "  First run - cloning repo..."
  git clone https://github.com/Panagiotissarr/Seal-backend.git /tmp/seal_fresh
  cp -r /tmp/seal_fresh/. .
  rm -rf /tmp/seal_fresh
  echo "  Repo cloned"
fi

echo "=== Step 3: Restore .env and config/ ==="
if [ -f "$BACKUP_DIR/env" ]; then
  cp "$BACKUP_DIR/env" .env && echo "  .env restored" || echo "  WARN: could not restore .env"
fi
if [ -d "$BACKUP_DIR/config" ]; then
  rm -rf config
  cp -r "$BACKUP_DIR/config" config && echo "  config/ restored" || echo "  WARN: could not restore config/"
fi
rm -rf "$BACKUP_DIR"

echo "=== Step 4: Install dependencies ==="
npm install 2>&1 || echo "FAIL: npm install failed"

echo "=== Step 5: Build ==="
npm run build 2>&1 || echo "FAIL: npm run build failed"

echo "=== Step 6: Start Bot ==="
node dist/index.js 2>&1
echo "=== Bot exited with code $? ==="

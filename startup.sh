#!/bin/bash
set -e
cd "$(dirname "$0")"

BACKUP_DIR=$(mktemp -d)

echo "Backing up .env and config/..."
cp .env "$BACKUP_DIR/env" 2>/dev/null || echo "  (no .env to back up)"
cp -r config "$BACKUP_DIR/config" 2>/dev/null || echo "  (no config/ to back up)"

echo "Pulling fresh from GitHub..."
git fetch --all
git reset --hard origin/main
git clean -fd

echo "Restoring .env and config/..."
cp "$BACKUP_DIR/env" .env 2>/dev/null || echo "  (no .env to restore)"
rm -rf config
cp -r "$BACKUP_DIR/config" config 2>/dev/null || echo "  (no config/ to restore)"
rm -rf "$BACKUP_DIR"

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Starting Seal Bot..."
exec node dist/index.js

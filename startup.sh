#!/bin/bash
set -e
cd "$(dirname "$0")"

BACKUP_DIR=$(mktemp -d)

[ -f .env ]   && cp .env "$BACKUP_DIR/env"     || true
[ -d config ] && cp -r config "$BACKUP_DIR/config" || true

if [ -d .git ]; then
  echo ">> Updating existing repo..."
  git fetch --all
  git reset --hard origin/main
  git clean -fd
else
  echo ">> First run — cloning repo..."
  git clone https://github.com/Panagiotissarr/Seal-backend.git /tmp/seal_fresh
  cp -r /tmp/seal_fresh/. .
  rm -rf /tmp/seal_fresh
fi

[ -f "$BACKUP_DIR/env" ]    && cp "$BACKUP_DIR/env" .env     || true
[ -d "$BACKUP_DIR/config" ] && rm -rf config && cp -r "$BACKUP_DIR/config" config || true
rm -rf "$BACKUP_DIR"

echo ">> Installing dependencies..."
npm install

echo ">> Building..."
npm run build

echo ">> Starting Seal Bot..."
exec node dist/index.js

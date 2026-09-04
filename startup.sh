#!/bin/bash
set -e

echo "=== Step 4: Install dependencies ==="
npm install

echo "=== Step 5: Build ==="
npm run build

echo "=== Step 6: Start Bot ==="
node dist/index.js

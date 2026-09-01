echo "=== Step 4: Install dependencies ==="
npm install 2>&1 || echo "FAIL: npm install failed"

echo "=== Step 5: Build ==="
npm run build 2>&1 || echo "FAIL: npm run build failed"

echo "=== Step 6: Start Bot ==="
node dist/index.js 2>&1
echo "=== Bot exited with code $? ==="

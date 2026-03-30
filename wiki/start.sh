#!/bin/bash
# Start the Alumium Wiki (idempotent)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8791
LOG=/tmp/alumium-wiki.log

if curl -sf --max-time 2 http://127.0.0.1:${PORT}/health > /dev/null 2>&1; then
  echo "[alumium-wiki] Already running on port ${PORT}"
  exit 0
fi

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "[alumium-wiki] Installing dependencies..."
  cd "$SCRIPT_DIR" && npm install --production 2>&1 | tail -5
fi

if [ ! -f "$SCRIPT_DIR/wiki.sqlite3" ]; then
  echo "[alumium-wiki] Setting up database..."
  cd "$SCRIPT_DIR" && /usr/bin/node setup-db.js
fi

cd "$SCRIPT_DIR"
nohup /usr/bin/node server.js >> "$LOG" 2>&1 &
echo "[alumium-wiki] Started (PID $!), log: $LOG"
sleep 1
curl -sf http://127.0.0.1:${PORT}/health && echo " — healthy" || echo " — WARNING: health check failed"

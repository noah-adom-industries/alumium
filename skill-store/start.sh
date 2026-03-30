#!/bin/bash
# Start the Alumium Skill Store (idempotent)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8790
LOG=/tmp/alumium-skill-store.log

if curl -sf --max-time 2 http://127.0.0.1:${PORT}/health > /dev/null 2>&1; then
  echo "[alumium-skill-store] Already running on port ${PORT}"
  exit 0
fi

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "[alumium-skill-store] Installing dependencies..."
  cd "$SCRIPT_DIR" && npm install --production 2>&1 | tail -5
fi

if [ ! -f "$SCRIPT_DIR/store.sqlite3" ]; then
  echo "[alumium-skill-store] Setting up database..."
  cd "$SCRIPT_DIR" && /usr/bin/node setup-db.js
fi

cd "$SCRIPT_DIR"
nohup /usr/bin/node server.js >> "$LOG" 2>&1 &
echo "[alumium-skill-store] Started (PID $!), log: $LOG"
sleep 1
curl -sf http://127.0.0.1:${PORT}/health && echo " — healthy" || echo " — WARNING: health check failed"

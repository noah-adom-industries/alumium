#!/bin/bash
# Alumium Service Container Bootstrap
#
# Usage (run in service container terminal):
#   bash <(curl -fsSL <url>/bootstrap.sh) --service skill-store
#   bash <(curl -fsSL <url>/bootstrap.sh) --service wiki
#
set -e

SERVICE="$1"
if [ "$1" = "--service" ]; then SERVICE="$2"; fi

if [ -z "$SERVICE" ]; then
  echo "Usage: $0 --service [skill-store|wiki]"
  exit 1
fi

REPO_URL="https://github.com/noah-adom-industries/alumium.git"
INSTALL_DIR="/home/adom/alumium"

echo ""
echo "==============================="
echo "  Alumium Bootstrap — $SERVICE"
echo "==============================="
echo ""

# 1. Clone / pull
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "[1] Pulling latest alumium..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "[1] Cloning alumium..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

# 2. Install deps for this service
echo ""
echo "[2] Installing dependencies for $SERVICE..."
cd "$INSTALL_DIR/$SERVICE"
npm install --production

# 3. Setup DB (idempotent)
echo ""
echo "[3] Setting up database..."
/usr/bin/node setup-db.js

# 4. Patch container entrypoint for auto-start on reboot
echo ""
echo "[4] Configuring auto-start..."
ENTRYPOINT=$(cat /proc/1/cmdline | tr '\0' ' ' | grep -oP '/[^\s]+entrypoint[^\s]*' | head -1 || true)
START_SCRIPT="$INSTALL_DIR/$SERVICE/start.sh"
chmod +x "$START_SCRIPT"

CRON_LINE="@reboot $START_SCRIPT >> /tmp/alumium-${SERVICE}-reboot.log 2>&1"
(crontab -l 2>/dev/null | grep -v "alumium"; echo "$CRON_LINE") | crontab -
echo "   Cron @reboot entry added."

# 5. Start service
echo ""
echo "[5] Starting $SERVICE..."
bash "$START_SCRIPT"

echo ""
echo "==============================="
echo "  Bootstrap complete!"
PORT=$(node -e "const s=require('./$SERVICE/service.json'); console.log(s.port)" 2>/dev/null || echo "8790")
echo "  Service:  http://127.0.0.1:${PORT}/health"
PROXY_URI=${VSCODE_PROXY_URI:-"(VSCODE_PROXY_URI not set)"}
echo "  Public:   ${PROXY_URI//\{\{port\}\}/${PORT}}"
echo "==============================="
echo ""

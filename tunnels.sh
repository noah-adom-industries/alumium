#!/bin/bash
# Alumium SSH Tunnel Manager
# Maintains persistent SSH tunnels from this container to service containers.
# Run once — it loops forever, auto-reconnecting on failure.
#
# Usage: bash tunnels.sh &

STORE_HOST="noah-service-alumium-skill-store-fwwrark8f72y@adom.cloud"
WIKI_HOST="noah-service-alumium-wiki-86u9jsxwmrny@adom.cloud"
SSH_OPTS="-o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o ConnectTimeout=10"

log() { echo "[tunnels] $(date '+%H:%M:%S') $*"; }

start_tunnel() {
  local name=$1 port=$2 host=$3
  if ssh $SSH_OPTS -f -N -L "${port}:127.0.0.1:${port}" "$host" 2>/dev/null; then
    log "$name tunnel established on :$port"
  else
    log "$name tunnel failed to bind :$port (may already be open)"
  fi
}

log "Starting tunnel manager..."

while true; do
  # Check store tunnel
  if ! curl -sf --max-time 3 http://127.0.0.1:8790/health > /dev/null 2>&1; then
    log "skill-store unreachable, reconnecting tunnel..."
    pkill -f "ssh.*-L 8790" 2>/dev/null; sleep 1
    start_tunnel "skill-store" 8790 "$STORE_HOST"
  fi

  # Check wiki tunnel
  if ! curl -sf --max-time 3 http://127.0.0.1:8791/health > /dev/null 2>&1; then
    log "wiki unreachable, reconnecting tunnel..."
    pkill -f "ssh.*-L 8791" 2>/dev/null; sleep 1
    start_tunnel "wiki" 8791 "$WIKI_HOST"
  fi

  sleep 30
done

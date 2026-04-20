#!/bin/bash
# CableSnap dev server with auto-restart on dependency changes + hourly restart
#
# Features:
#   - Watches package.json & package-lock.json for changes (polls every 5s)
#   - Auto runs `npm install` + restarts Expo when deps change
#   - Hourly restart with cache clear (prevents memory leaks / stale state)
#   - Auto-restarts if Expo crashes
#   - Clean shutdown on Ctrl+C
#
# Usage: ./scripts/dev-server.sh [--port PORT] [--interval SECONDS]

PORT=8082
RESTART_INTERVAL=3600  # 1 hour in seconds
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --port) PORT="$2"; shift 2 ;;
        --interval) RESTART_INTERVAL="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')]${NC} $1"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')]${NC} $1"; }
info() { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $1"; }

EXPO_PID=""

cleanup() {
    echo ""
    log "Shutting down..."
    if [ -n "$EXPO_PID" ]; then
        kill "$EXPO_PID" 2>/dev/null
        wait "$EXPO_PID" 2>/dev/null
    fi
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

get_checksum() {
    # MD5 hash of package.json + package-lock.json to detect changes
    cat "$PROJECT_DIR/package.json" "$PROJECT_DIR/package-lock.json" 2>/dev/null | md5
}

start_expo() {
    local extra_args="$1"
    log "Starting Expo dev server on port $PORT... $extra_args"
    cd "$PROJECT_DIR" || exit 1
    npx expo start --port "$PORT" $extra_args &
    EXPO_PID=$!
    log "Expo started (PID: $EXPO_PID)"
}

stop_expo() {
    if [ -n "$EXPO_PID" ]; then
        warn "Stopping Expo (PID: $EXPO_PID)..."
        kill "$EXPO_PID" 2>/dev/null
        wait "$EXPO_PID" 2>/dev/null
        EXPO_PID=""
    fi
}

install_deps() {
    log "Running npm install..."
    cd "$PROJECT_DIR" || exit 1
    npm install --no-audit --no-fund 2>&1 | tail -5
    log "Dependencies installed."
}

# --- Main ---
cd "$PROJECT_DIR" || exit 1

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  CableSnap Dev Server${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
info "Port:           $PORT"
info "Restart:        every $((RESTART_INTERVAL / 60)) min or on dep change"
info "Project:        $PROJECT_DIR"
info "Polling:        every 5s on package.json + package-lock.json"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Initial install + start
install_deps
start_expo

LAST_CHECKSUM=$(get_checksum)
LAST_RESTART=$(date +%s)
RESTART_COUNT=0

# Poll every 5 seconds
while true; do
    sleep 5

    # Check if Expo crashed
    if ! kill -0 "$EXPO_PID" 2>/dev/null; then
        err "Expo process died! Restarting..."
        RESTART_COUNT=$((RESTART_COUNT + 1))
        start_expo
        LAST_RESTART=$(date +%s)
        LAST_CHECKSUM=$(get_checksum)
        continue
    fi

    # Check for dependency changes (package.json or package-lock.json modified)
    CURRENT_CHECKSUM=$(get_checksum)
    if [ "$CURRENT_CHECKSUM" != "$LAST_CHECKSUM" ]; then
        echo ""
        warn "===> Dependency change detected! <==="
        stop_expo
        install_deps
        RESTART_COUNT=$((RESTART_COUNT + 1))
        start_expo "--clear"
        LAST_CHECKSUM=$(get_checksum)
        LAST_RESTART=$(date +%s)
        info "Restart count: $RESTART_COUNT"
        continue
    fi

    # Check hourly restart
    NOW=$(date +%s)
    ELAPSED=$((NOW - LAST_RESTART))
    if [ "$ELAPSED" -ge "$RESTART_INTERVAL" ]; then
        echo ""
        warn "===> Scheduled restart ($((ELAPSED / 60)) min elapsed) <==="
        stop_expo
        RESTART_COUNT=$((RESTART_COUNT + 1))
        start_expo "--clear"
        LAST_RESTART=$NOW
        LAST_CHECKSUM=$(get_checksum)
        info "Restart count: $RESTART_COUNT | Cache cleared"
        continue
    fi
done

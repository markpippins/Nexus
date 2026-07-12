#!/usr/bin/env bash
# ── Address-TTS MCP Server Daemon ────────────────────────────────────
# Auto-restarts the address-tts-mcp server on crash.
#
# Usage:
#   ./scripts/mcp-daemon.sh start
#   ./scripts/mcp-daemon.sh stop
#   ./scripts/mcp-daemon.sh restart
#   ./scripts/mcp-daemon.sh status
#
# Configurable via environment:
#   ADDRESS_TTS_MCP_PORT  — port to listen on (default 3105)
#   MCP_LOG               — log file (default /tmp/address-tts-mcp-daemon.log)
#   MCP_PID_FILE          — pid file (default /tmp/address-tts-mcp-daemon.pid)
#   TTS_URL               — TTS REST API URL (default http://localhost:8600)
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export ADDRESS_TTS_MCP_PORT="${ADDRESS_TTS_MCP_PORT:-3105}"
export MCP_LOG="${MCP_LOG:-/tmp/address-tts-mcp-daemon.log}"
export MCP_PID_FILE="${MCP_PID_FILE:-/tmp/address-tts-mcp-daemon.pid}"
export MCP_RESTART_DELAY="${MCP_RESTART_DELAY:-3}"
export TTS_URL="${TTS_URL:-http://localhost:8600}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] address-tts-mcp-daemon $*" | tee -a "$MCP_LOG"; }

daemon_running() {
  local pid
  pid="$(cat "$MCP_PID_FILE" 2>/dev/null || true)"
  if [ -z "$pid" ]; then return 1; fi
  kill -0 "$pid" 2>/dev/null
}

start() {
  if daemon_running; then
    log "already running (pid $(cat "$MCP_PID_FILE"))"
    return 0
  fi

  log "starting address-tts-mcp on port $ADDRESS_TTS_MCP_PORT ..."
  cd "$PROJECT_DIR"

  nohup env ADDRESS_TTS_MCP_PORT="$ADDRESS_TTS_MCP_PORT" TTS_URL="$TTS_URL" npx tsx src/index.ts >> "$MCP_LOG" 2>&1 &
  local pid=$!
  echo "$pid" > "$MCP_PID_FILE"

  # Wait a moment to detect immediate crash
  sleep 2
  if kill -0 "$pid" 2>/dev/null; then
    log "started (pid $pid)"
  else
    log "FAILED to start — check logs at $MCP_LOG"
    return 1
  fi
}

stop() {
  if ! daemon_running; then
    log "not running"
    return 0
  fi
  local pid
  pid="$(cat "$MCP_PID_FILE")"
  log "stopping (pid $pid)..."
  kill "$pid" 2>/dev/null && log "stopped" || log "already dead"
  rm -f "$MCP_PID_FILE"
}

restart() { stop; sleep 1; start; }

status() {
  if daemon_running; then
    local pid
    pid="$(cat "$MCP_PID_FILE")"
    echo "address-tts-mcp: RUNNING (pid $pid, port $ADDRESS_TTS_MCP_PORT)"
    echo "TTS URL: $TTS_URL"
  else
    echo "address-tts-mcp: STOPPED"
    return 1
  fi
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) restart ;;
  status)  status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac

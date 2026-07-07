#!/usr/bin/env bash
# ── Assembly-MCP Server Daemon ────────────────────────────────────────
# Auto-restarts the assembly-mcp server on crash.
#
# Usage:
#   ./scripts/mcp-daemon.sh start
#   ./scripts/mcp-daemon.sh stop
#   ./scripts/mcp-daemon.sh restart
#   ./scripts/mcp-daemon.sh status
#
# Configurable via environment:
#   MCP_PORT          — port to listen on (default 3102)
#   MCP_LOG           — log file (default /tmp/assembly-mcp-daemon.log)
#   MCP_PID_FILE      — pid file (default /tmp/assembly-mcp-daemon.pid)
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export ASSEMBLY_MCP_PORT="${ASSEMBLY_MCP_PORT:-3102}"
export MCP_LOG="${MCP_LOG:-/tmp/assembly-mcp-daemon.log}"
export MCP_PID_FILE="${MCP_PID_FILE:-/tmp/assembly-mcp-daemon.pid}"
export MCP_RESTART_DELAY="${MCP_RESTART_DELAY:-3}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] assembly-mcp-daemon $*" | tee -a "$MCP_LOG"; }

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

  log "starting assembly-mcp on port $ASSEMBLY_MCP_PORT ..."
  cd "$PROJECT_DIR"

  nohup env ASSEMBLY_MCP_PORT="$ASSEMBLY_MCP_PORT" npx tsx src/index.ts >> "$MCP_LOG" 2>&1 &
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
    log "running (pid $pid, port $ASSEMBLY_MCP_PORT)"
  else
    log "not running"
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

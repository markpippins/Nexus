#!/usr/bin/env bash
# ── TTS Server Daemon ─────────────────────────────────────────────────
# Auto-restarts the TTS server on crash.  Detects hung processes
# (health check fails for 30s) and kills + restarts.
#
# Usage:
#   ./tts-daemon.sh start
#   ./tts-daemon.sh stop
#   ./tts-daemon.sh restart
#   ./tts-daemon.sh status
#
# Configurable via environment:
#   TTS_PORT          — port to listen on (default 8600)
#   TTS_LOG           — log file (default /tmp/tts-daemon.log)
#   TTS_PID_FILE      — pid file (default /tmp/tts-daemon.pid)
#   TTS_RESTART_DELAY — seconds between restart attempts (default 3)
#   TTS_HEALTH_TTL    — seconds of failed health checks before kill (default 30)
#   DATABASE_URL      — PostgreSQL connection for health checks
#   NATS_URL          — NATS connection for event subscription
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export TTS_PORT="${TTS_PORT:-8600}"
export TTS_LOG="${TTS_LOG:-/tmp/tts-daemon.log}"
export TTS_PID_FILE="${TTS_PID_FILE:-/tmp/tts-daemon.pid}"
export TTS_RESTART_DELAY="${TTS_RESTART_DELAY:-3}"
export TTS_HEALTH_TTL="${TTS_HEALTH_TTL:-30}"
export DATABASE_URL="${DATABASE_URL:-postgres://pguser:pgpass@localhost:5432/nexus}"
export NATS_URL="${NATS_URL:-nats://localhost:4222}"

# ── helpers ──────────────────────────────────────────────────────────

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] tts-daemon $*" | tee -a "$TTS_LOG"; }

daemon_running() {
  local pid
  pid="$(cat "$TTS_PID_FILE" 2>/dev/null || true)"
  if [ -z "$pid" ]; then return 1; fi
  kill -0 "$pid" 2>/dev/null
}

tts_reachable() {
  curl -sf "http://localhost:${TTS_PORT}/health" >/dev/null 2>&1
}

# ── watchdog ── runs as a background process, auto-restarts TTS ──────

run_watchdog() {
  local restart_count=0
  local health_interval=5
  local max_fails=$(( TTS_HEALTH_TTL / health_interval ))
  local tts_pid=""

  # Trap: when the watchdog receives TERM/INT, cascade-kill the TTS child
  trap 'log "Watchdog shutting down..."; kill $tts_pid 2>/dev/null || true; exit 0' TERM INT

  while true; do
    log "Launching TTS server (restart #$restart_count)..."
    cd "$SCRIPT_DIR"

    python3 main.py >> "$TTS_LOG" 2>&1 &
    tts_pid=$!
    log "TTS server started (PID $tts_pid)"

    local consecutive_health_fails=0
    while kill -0 $tts_pid 2>/dev/null; do
      sleep "$health_interval"

      if curl -sf "http://localhost:${TTS_PORT}/health" >/dev/null 2>&1; then
        consecutive_health_fails=0
      else
        consecutive_health_fails=$((consecutive_health_fails + 1))
        if [ $consecutive_health_fails -ge $max_fails ]; then
          log "Health check failed for ${TTS_HEALTH_TTL}s — killing hung TTS (PID $tts_pid)"
          kill -9 $tts_pid 2>/dev/null || true
          break
        fi
      fi
    done

    wait $tts_pid 2>/dev/null || true
    local exit_code=$?
    log "TTS server exited (code $exit_code). Restarting in ${TTS_RESTART_DELAY}s..."
    restart_count=$((restart_count + 1))
    sleep "$TTS_RESTART_DELAY"
  done
}

# ── commands ─────────────────────────────────────────────────────────

cmd_start() {
  if daemon_running; then
    log "TTS daemon already running (PID $(cat "$TTS_PID_FILE"))"
    echo "Daemon already running."
    exit 0
  fi

  # Clean up any orphaned TTS processes from previous runs
  pkill -f "python3.*address/tts/main.py" 2>/dev/null || true
  sleep 1

  log "Starting TTS daemon (script=$SCRIPT_DIR, port=$TTS_PORT)"
  log "  DATABASE_URL=${DATABASE_URL%@*}"  # mask password
  log "  NATS_URL=$NATS_URL"
  log "Log: $TTS_LOG  |  Pid: $TTS_PID_FILE"

  # Launch watchdog as a regular background function
  run_watchdog >> "$TTS_LOG" 2>&1 &
  local daemon_pid=$!
  echo "$daemon_pid" > "$TTS_PID_FILE"
  log "Daemon watchdog started (PID $daemon_pid)"

  # Wait a moment and verify it's alive
  sleep 3
  if daemon_running; then
    log "Daemon is alive."
    echo "Daemon started (PID $daemon_pid)"
  else
    log "ERROR: Daemon failed to start. Check $TTS_LOG"
    echo "Daemon failed to start. Check $TTS_LOG"
    exit 1
  fi
}

cmd_stop() {
  if ! daemon_running; then
    log "TTS daemon not running"
    rm -f "$TTS_PID_FILE"
    # Clean up orphaned TTS anyway
    pkill -f "python3.*address/tts/main.py" 2>/dev/null || true
    echo "Daemon not running."
    exit 0
  fi

  local daemon_pid
  daemon_pid="$(cat "$TTS_PID_FILE")"
  log "Stopping TTS daemon (PID $daemon_pid)..."

  # Send TERM — watchdog trap will cascade-kill TTS child
  kill -TERM "$daemon_pid" 2>/dev/null || true
  sleep 2

  # Force kill if still alive
  if kill -0 "$daemon_pid" 2>/dev/null; then
    kill -9 "$daemon_pid" 2>/dev/null || true
  fi

  # Fallback to ensure no TTS orphans remain
  pkill -f "python3.*address/tts/main.py" 2>/dev/null || true

  rm -f "$TTS_PID_FILE"
  log "TTS daemon stopped"
  echo "Daemon stopped."
}

cmd_restart() {
  cmd_stop
  sleep 1
  cmd_start
}

cmd_status() {
  if daemon_running; then
    local pid
    pid="$(cat "$TTS_PID_FILE")"
    echo "TTS daemon: RUNNING (PID $pid)"
    if tts_reachable; then
      echo "Health:     OK (port $TTS_PORT)"
      # Show recent event count if available
      local recent
      recent="$(grep -c 'NATS event:' "$TTS_LOG" 2>/dev/null || echo 0)"
      echo "Events:     $recent received"
    else
      echo "Health:     UNREACHABLE (port $TTS_PORT)"
    fi
  else
    echo "TTS daemon: STOPPED"
    rm -f "$TTS_PID_FILE"
  fi
}

# ── main ─────────────────────────────────────────────────────────────

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac

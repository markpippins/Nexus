#!/usr/bin/env bash
# bin/redis-health-monitor.sh — Redis health watcher
# ===================================================
#
# Monitors Redis liveness. When Redis transitions from DOWN → UP,
# restarts all services that depend on it (service-registry,
# role-memory-srv, tackle-srv, tackle-mcp, cascade bridges).
#
# Designed to be run as a systemd timer (redis-health-monitor.timer)
# every 30 seconds, or standalone for one-off checks.
#
# Usage
# -----
#     bin/redis-health-monitor.sh              # one cycle
#     REDIS_CHECK_CMD="..." bin/redis-health-monitor.sh
#
# Exit codes
# ----------
#   0 — normal (no action needed or action completed)
#   1 — state file error

set -uo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="$(cd "$BIN_DIR/.." && pwd)"
STATE_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}/nexus-monitor"
STATE_FILE="$STATE_DIR/redis-health-state.json"

# ── Configuration ──────────────────────────────────────────────────────

# How to check Redis health. Try redis-cli first, fall back to port check.
REDIS_CHECK_CMD="${REDIS_CHECK_CMD:-}"

# How long to wait after restarting a service before giving up.
RESTART_WAIT_SECONDS=10

# Services that depend on Redis and need restarting when Redis recovers.
# Ordered by dependency chain (infrastructure first, then backends).
REDIS_DEPENDENT_SERVICES=(
    "service-registry.service"
    "role-memory-srv.service"
    "tackle-srv.service"
    "tackle-mcp.service"
    "cascade-event-bridge.service"
    "cascade-pg-bridge.service"
)

# ── Helpers ─────────────────────────────────────────────────────────────

_log() {
    local level="$1"
    shift
    echo "[redis-health-monitor] $(date '+%Y-%m-%d %H:%M:%S') [$level] $*"
}

# Check if Redis is healthy.
_redis_healthy() {
    # Try redis-cli ping first
    if command -v redis-cli &>/dev/null; then
        local result
        result=$(redis-cli -h localhost -p 6379 ping 2>/dev/null)
        if [[ "$result" == "PONG" ]]; then
            return 0
        fi
    fi
    # Fallback: check if port 6379 is listening (works without redis-cli)
    ss -tlnp 2>/dev/null | grep -q ':6379 ' 2>/dev/null && return 0
    # Fallback: check via /dev/tcp (bash built-in, no external deps)
    timeout 2 bash -c 'echo > /dev/tcp/localhost/6379' 2>/dev/null && return 0
    return 1
}

# Load previous state from JSON file.
# On first run (no state file), probe Redis and initialize state to match
# reality WITHOUT triggering a restart cycle.
_load_state() {
    if [[ -f "$STATE_FILE" ]]; then
        cat "$STATE_FILE" 2>/dev/null || echo '{"redis_was_up":false}'
    else
        # First run: initialize state based on actual Redis health
        # so we don't falsely detect a DOWN→UP transition.
        if _redis_healthy; then
            echo '{"redis_was_up":true}'
        else
            echo '{"redis_was_up":false}'
        fi
    fi
}

# Save current state to JSON file.
_save_state() {
    local was_up="$1"
    mkdir -p "$STATE_DIR"
    cat > "$STATE_FILE" <<EOF
{
  "redis_was_up": $was_up,
  "last_checked": "$(date -Iseconds)"
}
EOF
}

# Restart a systemd user service and wait for it to settle.
_restart_service() {
    local svc="$1"
    _log "INFO" "Restarting $svc (Redis recovered)..."
    if systemctl --user restart "$svc" 2>/dev/null; then
        _log "INFO" "$svc restarted successfully"
        return 0
    else
        _log "WARN" "Failed to restart $svc — may need manual intervention"
        return 1
    fi
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    local state
    state=$(_load_state)

    # Extract previous Redis state (default: not up)
    local redis_was_up
    redis_was_up=$(echo "$state" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('redis_was_up', False))" 2>/dev/null || echo "false")

    local redis_is_up=false
    if _redis_healthy; then
        redis_is_up=true
    fi

    # ── Transition: Redis was DOWN, now UP → restart dependent services ──
    if [[ "$redis_was_up" == "False" || "$redis_was_up" == "false" ]] && [[ "$redis_is_up" == "true" ]]; then
        _log "INFO" "Redis recovered (was down, now up) — restarting dependent services"

        for svc in "${REDIS_DEPENDENT_SERVICES[@]}"; do
            _restart_service "$svc"
            sleep 1
        done

        _log "INFO" "All Redis-dependent services restarted"
    fi

    # ── Transition: Redis was UP, now DOWN → log warning ──
    if [[ "$redis_was_up" == "True" || "$redis_was_up" == "true" ]] && [[ "$redis_is_up" == "false" ]]; then
        _log "WARN" "Redis went DOWN — dependent services may be affected"
    fi

    # ── Steady state ──
    if [[ "$redis_is_up" == "true" ]]; then
        _log "DEBUG" "Redis is healthy"
    else
        _log "DEBUG" "Redis is DOWN"
    fi

    # Persist current state
    _save_state "$redis_is_up"
}

main "$@"

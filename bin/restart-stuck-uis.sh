#!/usr/bin/env bash
# bin/restart-stuck-uis.sh — restart UI dev servers stuck in "activating" state
# ==========================================================================
#
# Angular/Vite dev servers (ng serve, vite) sometimes get stuck in systemd's
# "activating" state even though they're listening on their port. This script
# detects services that have been "activating" for >5 minutes and restarts
# them.
#
# Designed to be run as a systemd timer (restart-stuck-uis.timer) every 5
# minutes, or standalone for one-off checks.
#
# Usage
# -----
#     bin/restart-stuck-uis.sh              # one cycle
#     STUCK_TIMEOUT_SECONDS=600 bin/restart-stuck-uis.sh  # custom timeout
#
# Exit codes
# ----------
#   0 — normal (no action needed or action completed)
#   1 — state file error

set -uo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}/nexus-monitor"

# ── Configuration ──────────────────────────────────────────────────────

# How many seconds a service can stay "activating" before we restart it.
STUCK_TIMEOUT_SECONDS="${STUCK_TIMEOUT_SECONDS:-300}"  # 5 minutes

# UI services to monitor — matches the list in start-nexus-uis.sh
UI_SERVICES=(
    "nexus-console"
    "conduit-ui"
    "tackle-ui"
    "nebula-ui"
    "duality-ui"
    "angular-assembly"
    "cascade-ui"
    "plurality-ui"
    "execution-ui"
    "view-architect"
    "peb-ui"
    "semantic-kernel-ui"
    "conduit-ui-legacy"
)

# ── Helpers ─────────────────────────────────────────────────────────────

_log() {
    local level="$1"
    shift
    echo "[restart-stuck-uis] $(date '+%Y-%m-%d %H:%M:%S') [$level] $*"
}

# Get the first-seen timestamp file path for a service.
_stamp_file() {
    local svc="$1"
    echo "$STATE_DIR/stuck-${svc}.stamp"
}

# Record that a service just entered "activating" state.
_record_first_seen() {
    local svc="$1"
    local stamp
    stamp="$(_stamp_file "$svc")"
    mkdir -p "$STATE_DIR"
    date +%s > "$stamp"
    _log "DEBUG" "$svc entered activating state — recorded at $(date -Iseconds)"
}

# Clear the recorded timestamp (service is no longer stuck).
_clear_stamp() {
    local svc="$1"
    local stamp
    stamp="$(_stamp_file "$svc")"
    if [[ -f "$stamp" ]]; then
        rm -f "$stamp"
        _log "DEBUG" "$svc left activating state — cleared stamp"
    fi
}

# Check if a service has been "activating" longer than the timeout.
_is_stuck() {
    local svc="$1"
    local stamp
    stamp="$(_stamp_file "$svc")"

    if [[ ! -f "$stamp" ]]; then
        return 1  # not tracked yet
    fi

    local first_seen now elapsed
    first_seen=$(cat "$stamp" 2>/dev/null)
    now=$(date +%s)
    elapsed=$((now - first_seen))

    if [[ "$elapsed" -ge "$STUCK_TIMEOUT_SECONDS" ]]; then
        _log "WARN" "$svc has been activating for ${elapsed}s (timeout: ${STUCK_TIMEOUT_SECONDS}s)"
        return 0  # stuck
    fi

    return 1  # not stuck yet
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    local restart_count=0

    for svc in "${UI_SERVICES[@]}"; do
        local unit="${svc}.service"
        local state

        state=$(systemctl --user is-active "$unit" 2>/dev/null || echo "unknown")

        case "$state" in
            activating)
                # Service is in the process of starting.
                # Check if we already have a first-seen stamp for it.
                local stamp
                stamp="$(_stamp_file "$svc")"
                if [[ -f "$stamp" ]]; then
                    # We've seen it before — check if it's stuck.
                    if _is_stuck "$svc"; then
                        _log "INFO" "Restarting stuck service $svc..."
                        if systemctl --user restart "$unit" 2>/dev/null; then
                            _log "INFO" "$svc restarted successfully"
                            _clear_stamp "$svc"
                            ((restart_count++))
                        else
                            _log "ERROR" "Failed to restart $svc"
                        fi
                    fi
                else
                    # First time seeing it in activating state — record it.
                    _record_first_seen "$svc"
                fi
                ;;
            active)
                # Service is running fine — clear any stuck stamp.
                _clear_stamp "$svc"
                ;;
            failed)
                # Service failed — restart it immediately (don't wait).
                _log "WARN" "$svc is in failed state — restarting"
                systemctl --user restart "$unit" 2>/dev/null && \
                    _log "INFO" "$svc restarted from failed state" || \
                    _log "ERROR" "Failed to restart $svc from failed state"
                _clear_stamp "$svc"
                ((restart_count++))
                ;;
            *)
                # inactive, dead, etc. — no action needed.
                _clear_stamp "$svc"
                ;;
        esac
    done

    if [[ "$restart_count" -gt 0 ]]; then
        _log "INFO" "Cycle complete — restarted $restart_count service(s)"
    else
        _log "DEBUG" "Cycle complete — no restarts needed"
    fi

    return 0
}

main "$@"

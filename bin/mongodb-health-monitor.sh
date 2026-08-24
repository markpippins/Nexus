#!/usr/bin/env bash
# bin/mongodb-health-monitor.sh — MongoDB health watcher
# ======================================================
#
# Monitors MongoDB liveness. When MongoDB transitions from DOWN → UP,
# restarts all services that depend on it (broker-gateway and other
# Spring Boot services with MongoRepository dependencies).
#
# Designed to be run as a systemd timer (mongodb-health-monitor.timer)
# every 30 seconds, or standalone for one-off checks.
#
# Usage
# -----
#     bin/mongodb-health-monitor.sh              # one cycle
#
# Exit codes
# ----------
#   0 — normal (no action needed or action completed)
#   1 — state file error

set -uo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="$(cd "$BIN_DIR/.." && pwd)"
STATE_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}/nexus-monitor"
STATE_FILE="$STATE_DIR/mongodb-health-state.json"

# ── Configuration ──────────────────────────────────────────────────────

# Services that depend on MongoDB and need restarting when it recovers.
# broker-gateway hosts the Spring Boot service-broker components
# (search, user, note, admin-logging) that use MongoRepository.
MONGODB_DEPENDENT_SERVICES=(
    "broker-gateway.service"
)

# ── Terrain registry write-back ────────────────────────────────────────
# MongoDB has no HTTP health endpoint and no heartbeat registration, so
# staleness sweeps periodically flip its terrain row OFFLINE while the
# service is healthy (incident 1f5c2806, 2026-08-23). This monitor already
# computes authoritative liveness every cycle — so we write the truth back.
TERRAIN_DSN="${PEB_DATABASE_URL:-postgresql://pguser:pgpass@localhost:5432/nexus}"
TERRAIN_SERVICE_NAME="mongodb"

_sync_terrain_status() {
    local is_up="$1"   # "true" / "false"
    local want="ONLINE"
    [[ "$is_up" == "false" ]] && want="OFFLINE"
    local current
    current=$(PGPASSWORD=pgpass PGUSER=pguser psql -h localhost -d nexus -t -A \
        -c "SELECT status FROM terrain.runnable_services WHERE name='${TERRAIN_SERVICE_NAME}' LIMIT 1;" 2>/dev/null)
    if [[ -z "$current" ]]; then
        _log "WARN" "Terrain row for '$TERRAIN_SERVICE_NAME' not found — skipping write-back"
        return 0
    fi
    if [[ "$current" != "$want" ]]; then
        PGPASSWORD=pgpass PGUSER=pguser psql -h localhost -d nexus -q \
            -c "UPDATE terrain.runnable_services SET status='${want}' WHERE name='${TERRAIN_SERVICE_NAME}' AND status <> '${want}';" 2>/dev/null
        _log "INFO" "Terrain status reconciled for $TERRAIN_SERVICE_NAME: ${current} -> ${want}"
    fi
}

# ── Helpers ─────────────────────────────────────────────────────────────

_log() {
    local level="$1"
    shift
    echo "[mongodb-health-monitor] $(date '+%Y-%m-%d %H:%M:%S') [$level] $*"
}

# Check if MongoDB is healthy. Uses multiple fallback methods.
_mongodb_healthy() {
    # Method 1: mongosh ping (newer MongoDB versions) — with 5s timeout
    if command -v mongosh &>/dev/null; then
        if timeout 5 mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' "mongodb://localhost:27017" 2>/dev/null | grep -q '1'; then
            return 0
        fi
    fi
    # Method 2: mongo ping (older MongoDB versions) — with 5s timeout
    if command -v mongo &>/dev/null; then
        if timeout 5 mongo --quiet --eval 'db.runCommand({ ping: 1 }).ok' "mongodb://localhost:27017" 2>/dev/null | grep -q '1'; then
            return 0
        fi
    fi
    # Method 3: check if Docker container is running
    if command -v docker &>/dev/null; then
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'atomic-mongodb'; then
            # Container exists — try a direct port check to confirm it's responding
            timeout 2 bash -c 'echo > /dev/tcp/localhost/27017' 2>/dev/null && return 0
        fi
    fi
    # Method 4: raw port check
    ss -tlnp 2>/dev/null | grep -q ':27017 ' 2>/dev/null && return 0
    # Method 5: /dev/tcp bash built-in
    timeout 2 bash -c 'echo > /dev/tcp/localhost/27017' 2>/dev/null && return 0
    return 1
}

# Load previous state from JSON file.
# On first run (no state file), probe MongoDB and initialize state to match
# reality WITHOUT triggering a restart cycle.
_load_state() {
    if [[ -f "$STATE_FILE" ]]; then
        cat "$STATE_FILE" 2>/dev/null || echo '{"mongodb_was_up":false}'
    else
        if _mongodb_healthy; then
            echo '{"mongodb_was_up":true}'
        else
            echo '{"mongodb_was_up":false}'
        fi
    fi
}

# Save current state to JSON file.
_save_state() {
    local was_up="$1"
    mkdir -p "$STATE_DIR"
    cat > "$STATE_FILE" <<EOF
{
  "mongodb_was_up": $was_up,
  "last_checked": "$(date -Iseconds)"
}
EOF
}

# Restart a systemd user service.
_restart_service() {
    local svc="$1"
    _log "INFO" "Restarting $svc (MongoDB recovered)..."
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

    # Extract previous MongoDB state
    local mongodb_was_up
    mongodb_was_up=$(echo "$state" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('mongodb_was_up', False))" 2>/dev/null || echo "false")

    local mongodb_is_up=false
    if _mongodb_healthy; then
        mongodb_is_up=true
    fi

    # ── Transition: MongoDB was DOWN, now UP → restart dependent services ──
    if [[ "$mongodb_was_up" == "False" || "$mongodb_was_up" == "false" ]] && [[ "$mongodb_is_up" == "true" ]]; then
        _log "INFO" "MongoDB recovered (was down, now up) — restarting dependent services"

        for svc in "${MONGODB_DEPENDENT_SERVICES[@]}"; do
            _restart_service "$svc"
            sleep 1
        done

        _log "INFO" "All MongoDB-dependent services restarted"
    fi

    # ── Transition: MongoDB was UP, now DOWN → log warning ──
    if [[ "$mongodb_was_up" == "True" || "$mongodb_was_up" == "true" ]] && [[ "$mongodb_is_up" == "false" ]]; then
        _log "WARN" "MongoDB went DOWN — dependent services may be affected"
    fi

    # ── Steady state ──
    if [[ "$mongodb_is_up" == "true" ]]; then
        _log "DEBUG" "MongoDB is healthy"
    else
        _log "DEBUG" "MongoDB is DOWN"
    fi

    # ── Terrain registry write-back (liveness truth, every cycle) ──
    _sync_terrain_status "$mongodb_is_up"

    # Persist current state
    _save_state "$mongodb_is_up"
}

main "$@"

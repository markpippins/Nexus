#!/bin/bash
# bin/start-nexus-services.sh — bring up ALL Nexus systemd-managed daemons
#
# Usage:
#   bin/start-nexus-services.sh start    # start all nexus daemons (idempotent)
#   bin/start-nexus-services.sh status   # show systemd status for all
#   bin/start-nexus-services.sh stop     # stop all nexus daemons
#   bin/start-nexus-services.sh restart  # restart all nexus daemons
#
# Manages user-level systemd units under ~/.config/systemd/user/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

# ── Ordered service list ───────────────────────────────────────────────
# Infrastructure first, then databases, then backends, then MCPs
ALL_SERVICES=(
    # Infrastructure (Docker-based)
    "redis.service"
    "mongodb.service"

    # Core backends
    "service-registry.service"  # port 8085 — service discovery
    "broker-gateway.service"    # port 8081 — service broker gateway
    "terrain.service"          # port 8084 — topology registry
    "peb-kernel.service"       # port 8080 — engineering brain
    "nebula-srv.service"       # Nebula RMS API
    "role-memory-srv.service"  # port 3500 — PG→Redis sync
    "wrp-bridge-daemon.service" # conduit→kernel sync

    # API servers
    "vision-srv.service"       # port 3103 — Vision LOSM
    "vision-srv-3104.service"  # port 3104 — Vision LOSM (alt)
    "vision-srv-py.service"    # port 8003 — Vision Python
    "image-server.service"     # Image hosting

    # TTS stack
    "address-tts.service"      # port 8600 — speech synthesis
    "address-tts-mcp.service"  # port 3105 — TTS MCP

    # MCP servers
    "conduit-mcp.service"      # port 3100 — work request orchestration
    "nebula-mcp-sse.service"   # port 3102 — Nebula MCP SSE
    "nebula-mcp.service"       # stdio  — Nebula MCP (on-demand; clients spawn independently)
    "terrain-mcp.service"      # stdio  — Terrain topology MCP (on-demand; clients spawn independently)
    "tackle-mcp.service"       # port 3400 — AI config registry
)

# On-demand services — included in start/status/stop but NOT enabled on boot.
# These are stdio MCP servers that clients spawn independently; the systemd
# units exist for visibility and management.  RemainAfterExit=yes keeps them
# showing as "active (exited)" rather than failed.
ON_DEMAND_SERVICES=(
    "nebula-mcp.service"
    "terrain-mcp.service"
)

# ── Commands ────────────────────────────────────────────────────────────

cmd_start_all() {
    echo "=== Starting Nexus Services ==="
    for svc in "${ALL_SERVICES[@]}"; do
        echo -n "  $svc ... "
        if systemctl --user is-active --quiet "$svc" 2>/dev/null; then
            echo "already running"
        else
            systemctl --user start "$svc" 2>&1 | tail -1 || echo "FAILED"
            sleep 0.5
        fi
    done
    echo "=== Done ==="
}

cmd_status_all() {
    echo "=== Nexus Service Status ==="
    printf "%-35s %-10s %s\n" "SERVICE" "ACTIVE" "SUB"
    printf "%-35s %-10s %s\n" "-------" "------" "---"
    for svc in "${ALL_SERVICES[@]}"; do
        local active=$(systemctl --user is-active "$svc" 2>/dev/null || echo "unknown")
        local sub=$(systemctl --user show -p SubState --value "$svc" 2>/dev/null || echo "-")
        printf "%-35s %-10s %s\n" "$svc" "$active" "$sub"
    done
}

cmd_stop_all() {
    echo "=== Stopping Nexus Services ==="
    for svc in "${ALL_SERVICES[@]}"; do
        echo -n "  $svc ... "
        if systemctl --user is-active --quiet "$svc" 2>/dev/null; then
            systemctl --user stop "$svc" 2>&1 | tail -1 || echo "FAILED"
        else
            echo "not running"
        fi
    done
    echo "=== Done ==="
}

cmd_restart_all() {
    cmd_stop_all
    sleep 2
    cmd_start_all
}

cmd_enable_all() {
    echo "=== Enabling Nexus Services (auto-start on boot) ==="
    for svc in "${ALL_SERVICES[@]}"; do
        # Skip on-demand services
        local skip=false
        for od in "${ON_DEMAND_SERVICES[@]}"; do
            [[ "$svc" == "$od" ]] && skip=true && break
        done
        if $skip; then
            echo "  $svc ... skipped (on-demand)"
            continue
        fi
        echo -n "  $svc ... "
        systemctl --user enable "$svc" 2>&1 | tail -1 || echo "FAILED"
    done
}

# ── Main ────────────────────────────────────────────────────────────────

case "${1:-status}" in
    start)   cmd_start_all ;;
    status)  cmd_status_all ;;
    stop)    cmd_stop_all ;;
    restart) cmd_restart_all ;;
    enable)  cmd_enable_all ;;
    *)
        echo "Usage: $0 {start|status|stop|restart|enable}"
        exit 1
        ;;
esac

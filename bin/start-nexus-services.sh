#!/bin/bash
# bin/start-nexus-services.sh — bring up ALL Nexus systemd-managed daemons
#
# Usage:
#   bin/start-nexus-services.sh start    # start all nexus daemons (idempotent)
#   bin/start-nexus-services.sh status   # show systemd + actual health status for all
#   bin/start-nexus-services.sh stop     # stop all nexus daemons
#   bin/start-nexus-services.sh restart  # restart all nexus daemons
#   bin/start-nexus-services.sh health   # quick HTTP health check of all services
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
    "broker-gateway.service"    # port 8081 — service broker gateway (Spring Boot)
    "quarkus-broker-gateway.service"  # port 8091 — service broker gateway (Quarkus)
    "helidon-user-access-service.service"  # port 9093 — user access control (Helidon MP)
    "terrain.service"          # port 8084 — topology registry
    "file-system-server.service"        # port 4042 — file system operations (edit-ui)
    "secure-file-system-server.service" # port 4040 — secure file system operations (service-broker)
    "ui-event-bus.service"     # port 3200 — cross-app UI event bus (SSE)
    "peb-kernel.service"       # port 8080 — engineering brain
    "kernel-srv.service"       # port 8100 — Semantic Kernel REST API (wraps sys_transition, sys_issue_receipt, v_* views; SSE over pg_notify)
    "nebula-srv.service"       # Nebula RMS API
    "cascade-srv.service"      # port 3106 — Cascade Event API
    "role-memory-srv.service"  # port 3500 — PG→Redis sync
    "wrp-bridge-daemon.service" # conduit→kernel sync
    "cascade-kernel-subscriber.service" # pg_notify → NATS (kernel transitions)
    "cascade-obs-subscriber.service"   # pg_notify → NATS (PEB governance + Vision lifecycle)

    # API servers
    "vision-srv-py.service"    # port 8003 — Vision Python
    "losm-host.service"        # port 8006 — LOSM Host (FastAPI)
    "image-server.service"     # Image hosting

    # TTS stack
    "address-tts.service"      # port 8600 — speech synthesis
    "address-tts-mcp.service"  # port 3105 — TTS MCP

    # Assembly — forums, threads, users
    "assembly-srv.service"     # port 3107 — Assembly REST API
    "assembly-mcp.service"     # port 3113 — Assembly MCP

    # Operator + MCP servers
    "operator-svc.service"     # port 3018 — Operator host personality
    "conduit-kernel.service"   # port 3103 — WRP kernel FastAPI (sessions/breaker/receipts/admin/delta/replay)
    "conduit-mcp.service"      # port 3100 — work request orchestration
    "conduit-srv.service"      # port 3104 — conduit REST API (extracted from conduit-mcp)
    "pty-srv.service"          # port 3120 — WebSocket PTY bridge for xterm.js
    "nebula-mcp-sse.service"   # port 3102 — Nebula MCP SSE
    "nebula-mcp.service"       # stdio  — Nebula MCP (on-demand; clients spawn independently)
    "terrain-mcp.service"      # stdio  — Terrain topology MCP (on-demand; clients spawn independently)
    "tackle-srv.service"      # port 3410 — tackle AI config & memory REST API
    "tackle-mcp.service"       # port 3400 — AI config registry MCP (→ tackle-srv)    "knowledge-srv.service"    # port 3109 — knowledge REST API (graph_entities, graph_edges, xrefs, migrations)
    "peb-srv.service"          # port 3111 — PEB observability REST API
    "cpf-api.service"          # port 3108 — CPF funnel data API
    "atlas.service"            # port 8090 — graph views persistence
    "execution-srv.service"    # port 3110 — execution observability REST API
    "mcp-bridge.service"       # ports 3131-3134 — generic stdio-to-SSE bridge (knowledge/vision/peb/terrain MCPs)
    "tools-aggregator.service" # port 3210 — unified MCP tool-discovery aggregator
    "service-broker-mcp.service" # port 3112 — service-broker MCP over SSE (auth/token tools)
    "substance.service"        # port 3115 — Segment Sets API (FastAPI)
    "moleculer-search.service"  # port 4050 — Moleculer Search API (Google, registry)
    "ui-tools.service"          # port 3125 — UI Tools CRUD API (statusbar links)
    "ui-tools-mcp.service"       # port 3136 — UI Tools MCP (agent-facing link management)
    "semantics-srv.service"      # port 3160 — semantics REST API (semantics.* schema — type-level legend)
    "semantics-mcp.service"      # port 3161 — semantics MCP (→ semantics-srv)
    "apidocs-srv.service"        # port 3180 — API docs index (Swagger UI + ReDoc over all *-srv specs)

    # API servers (non-UI services)
    "wind-srv.service"         # port 3300 — Wind IDE workflow API
    "mildred-dam-api.service"   # port 3140 — Mildred Digital Asset Management
    "voyager-srv.service"       # port 3114 — Voyager REST API (filesystem acquisition queries)
    "voyager.service"           # no port — Filesystem acquisition layer (NATS-backed)

    # UI dev servers (Angular/Vite — managed via systemd, not tmux)
    "nebula-ui.service"         # port 4210 — Nebula RMS UI
    "duality-ui.service"        # port 3002 — Duality UI
    "view-architect.service"    # port 3003 — View Architect UI
    "plurality-ui.service"      # port 3004 — Plurality UI
    "nexus-console.service"     # port 4200 — Nexus Console
    "conduit-ui.service"        # port 4201 — Conduit UI
    "tackle-ui.service"         # port 4202 — Tackle UI
    "cascade-ui.service"        # port 4203 — Cascade UI
    "angular-assembly.service"  # port 4204 — Assembly UI
    "execution-ui.service"      # port 4205 — Execution UI
    "peb-ui.service"            # port 4206 — PEB UI
    "semantic-kernel-ui.service" # port 4207 — Semantic Kernel UI
)

# ── Service metadata for health checks ─────────────────────────────────
# Maps service name → port for health verification
declare -A SERVICE_PORTS
SERVICE_PORTS=(
    ["redis.service"]="6379"
    ["mongodb.service"]="27017"
    ["service-registry.service"]="8085"
    ["broker-gateway.service"]="8081"
    ["quarkus-broker-gateway.service"]="8091"
    ["helidon-user-access-service.service"]="9093"
    ["terrain.service"]="8084"
    ["file-system-server.service"]="4042"
    ["secure-file-system-server.service"]="4040"
    ["ui-event-bus.service"]="3200"
    ["peb-kernel.service"]="8080"
    ["kernel-srv.service"]="8100"
    ["nebula-srv.service"]="3101"
    ["cascade-srv.service"]="3106"
    ["role-memory-srv.service"]="3500"
    # wrp-bridge-daemon — no HTTP health endpoint
    ["vision-srv-py.service"]="8003"
    ["losm-host.service"]="8006"
    # image-server — no HTTP health endpoint
    ["address-tts.service"]="8600"
    ["address-tts-mcp.service"]="3105"
    ["assembly-srv.service"]="3107"
    ["assembly-mcp.service"]="3113"
    ["conduit-kernel.service"]="3103"
    ["conduit-mcp.service"]="3100"
    ["conduit-srv.service"]="3104"
    ["nebula-mcp-sse.service"]="3102"
    # nebula-mcp.service — stdio, on-demand (no port)
    # terrain-mcp.service — stdio, on-demand (no port)
    ["tackle-srv.service"]="3410"
    ["tackle-mcp.service"]="3400"
    ["knowledge-srv.service"]="3109"
    ["peb-srv.service"]="3111"
    ["operator-svc.service"]="3018"
    ["pty-srv.service"]="3121"
["cpf-api.service"]="3108"
    ["atlas.service"]="8090"
    ["execution-srv.service"]="3110"
    ["mcp-bridge.service"]="3131"     # one of ports 3131-3134 — any bridge target's /health works
    ["tools-aggregator.service"]="3210"
    ["service-broker-mcp.service"]="3112"
    ["wind-srv.service"]="3300"
    ["mildred-dam-api.service"]="3140"
    ["voyager-srv.service"]="3114"
    # voyager.service — no HTTP health endpoint (NATS-based)
    ["substance.service"]="3115"
    ["moleculer-search.service"]="4050"
    ["ui-tools.service"]="3125"
    ["ui-tools-mcp.service"]="3136"
    ["semantics-srv.service"]="3160"
    ["semantics-mcp.service"]="3161"
    ["apidocs-srv.service"]="3180"
    ["nebula-ui.service"]="4210"
    ["duality-ui.service"]="3002"
    ["view-architect.service"]="3003"
    ["plurality-ui.service"]="3004"
    ["nexus-console.service"]="4200"
    ["conduit-ui.service"]="4201"
    ["tackle-ui.service"]="4202"
    ["cascade-ui.service"]="4203"
    ["angular-assembly.service"]="4204"
    ["execution-ui.service"]="4205"
    ["peb-ui.service"]="4206"
    ["semantic-kernel-ui.service"]="4207"
)

# ── Custom health check paths (for services that don't serve /health) ──
declare -A SERVICE_HEALTH_PATHS
SERVICE_HEALTH_PATHS=(
    # UI dev servers serve Angular/Vite HTML on /, not /health
    ["nebula-ui.service"]="/"
    ["duality-ui.service"]="/"
    ["view-architect.service"]="/"
    ["plurality-ui.service"]="/"
    ["nexus-console.service"]="/"
    ["conduit-ui.service"]="/"
    ["tackle-ui.service"]="/"
    ["cascade-ui.service"]="/"
    ["angular-assembly.service"]="/"
    ["execution-ui.service"]="/"
    ["peb-ui.service"]="/"
    ["semantic-kernel-ui.service"]="/"
    # Other services with non-standard health paths
    ["terrain.service"]="/api/v1/platform/health"
    ["quarkus-broker-gateway.service"]="/api/health"
    ["mildred-dam-api.service"]="/api/health"
    ["voyager-srv.service"]="/api/health"
)

# Docker-based services (verified via docker ps instead of port check)
DOCKER_SERVICES=(
    "redis.service"
    "mongodb.service"
)

# On-demand services — included in start/status/stop but NOT enabled on boot.
# These are stdio MCP servers that clients spawn independently; the systemd
# units exist for visibility and management.  RemainAfterExit=yes keeps them
# showing as "active (exited)" rather than failed.
ON_DEMAND_SERVICES=(
    "nebula-mcp.service"
    "terrain-mcp.service"
)

# ── Helpers ─────────────────────────────────────────────────────────────

# Check if a service is in an array
_in_array() {
    local needle="$1"; shift
    for item in "$@"; do
        [[ "$item" == "$needle" ]] && return 0
    done
    return 1
}

# Map service name → Docker container name
_docker_container_for() {
    case "$1" in
        redis.service)   echo "atomic-redis-dev" ;;
        mongodb.service) echo "atomic-mongodb" ;;
        *)               echo "" ;;
    esac
}

# Check Docker container liveness
_docker_container_running() {
    local container_name="$1"
    docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$container_name"
}

# Check if a port is listening
_port_listening() {
    local port="$1"
    ss -tlnp 2>/dev/null | grep -q ":$port "
}

# Quick HTTP health probe (returns 0 if healthy, non-zero otherwise)
_http_healthy() {
    local port="$1"
    local path="${2:-/health}"
    curl -s --max-time 2 "http://localhost:${port}${path}" >/dev/null 2>&1
}

# Get systemd SubState for a service
_substate() {
    systemctl --user show -p SubState --value "$1" 2>/dev/null || echo "-"
}

# Get systemd ActiveState for a service
_is_active() {
    systemctl --user is-active --quiet "$1" 2>/dev/null
}

# ── Commands ────────────────────────────────────────────────────────────

cmd_start_all() {
    echo "=== Starting Nexus Services ==="
    systemctl --user daemon-reload
    for svc in "${ALL_SERVICES[@]}"; do
        echo -n "  $svc ... "
        if _is_active "$svc"; then
            # For Docker services, verify the container is actually running
            if _in_array "$svc" "${DOCKER_SERVICES[@]}"; then
                local container
                container=$(_docker_container_for "$svc")
                if _docker_container_running "$container"; then
                    echo "already running (container verified)"
                else
                    echo "systemd says active but container missing — restarting"
                    systemctl --user restart "$svc" 2>&1 | tail -1 || echo "FAILED"
                fi
            else
                echo "already running"
            fi
        else
            systemctl --user start "$svc" 2>&1 | tail -1 || echo "FAILED"
            sleep 0.5
        fi
    done
    echo "=== Done ==="
}

cmd_status_all() {
    echo "=== Nexus Service Status ==="
    printf "%-35s %-10s %-12s %s\n" "SERVICE" "ACTIVE" "SUB" "HEALTH"
    printf "%-35s %-10s %-12s %s\n" "-------" "------" "---" "------"
    for svc in "${ALL_SERVICES[@]}"; do
        local active
        if _is_active "$svc"; then
            active="active"
        else
            active="inactive"
        fi

        local sub
        sub=$(_substate "$svc")

        # Determine health based on actual service type
        local health="—"

        # On-demand services: "exited" is normal (RemainAfterExit=yes tracking units)
        if _in_array "$svc" "${ON_DEMAND_SERVICES[@]}"; then
            if [[ "$sub" == "exited" ]]; then
                sub="tracking"  # Normal state for on-demand stdio MCP servers
                health="OK (on-demand)"
            fi
        # Docker services: container liveness is the source of truth.
        # NOTE: do NOT short-circuit on `[[ "$sub" == "running" ]]` — systemd's
        # SubState lags actual container liveness during teardown, which caused
        # a false "OK (docker)" report while the container was already gone.
        # See audit record ef2ef768 (2026-08-03).
        elif _in_array "$svc" "${DOCKER_SERVICES[@]}"; then
            local container
            container=$(_docker_container_for "$svc")
            if _docker_container_running "$container"; then
                health="OK (docker)"
            elif [[ "$active" == "active" ]]; then
                # systemd says active but the container is missing — surface
                # the divergence instead of hiding it as "OK".
                health="⚠ systemd active, container missing"
            else
                health="DOWN"
            fi
        # Services with HTTP ports: probe /health
        elif [[ -n "${SERVICE_PORTS[$svc]:-}" ]]; then
            local port="${SERVICE_PORTS[$svc]}"
            if _port_listening "$port"; then
                health="OK (port $port)"
            elif [[ "$active" == "active" ]]; then
                health="⚠ port $port not listening"
            else
                health="DOWN"
            fi
        # Services without known ports
        else
            if [[ "$active" == "active" ]]; then
                health="OK"
            else
                health="DOWN"
            fi
        fi

        printf "%-35s %-10s %-12s %s\n" "$svc" "$active" "$sub" "$health"
    done
}

cmd_health() {
    echo "=== Nexus Health Check (HTTP probes) ==="
    printf "%-35s %-8s %s\n" "SERVICE" "PORT" "STATUS"
    printf "%-35s %-8s %s\n" "-------" "----" "------"

    local all_ok=true

    for svc in "${ALL_SERVICES[@]}"; do
        local port="${SERVICE_PORTS[$svc]:-}"

        # On-demand services (stdio MCP) — check if port 3101/3102 responder is up
        if _in_array "$svc" "${ON_DEMAND_SERVICES[@]}"; then
            printf "%-35s %-8s %s\n" "$svc" "stdio" "on-demand (tracking)"
            continue
        fi

        # Docker services
        if _in_array "$svc" "${DOCKER_SERVICES[@]}"; then
            local container
            container=$(_docker_container_for "$svc")
            if _docker_container_running "$container"; then
                printf "%-35s %-8s %s\n" "$svc" "$port" "✓ OK (docker)"
            else
                printf "%-35s %-8s %s\n" "$svc" "$port" "✗ DOWN"
                all_ok=false
            fi
            continue
        fi

        if [[ -z "$port" ]]; then
            printf "%-35s %-8s %s\n" "$svc" "—" "no port"
            continue
        fi

        local health_path="${SERVICE_HEALTH_PATHS[$svc]:-/health}"
        if _http_healthy "$port" "$health_path"; then
            printf "%-35s %-8s %s\n" "$svc" "$port" "✓ OK"
        else
            printf "%-35s %-8s %s\n" "$svc" "$port" "✗ DOWN"
            all_ok=false
        fi
    done

    echo
    if $all_ok; then
        echo "All services healthy ✓"
    else
        echo "Some services are DOWN ✗"
    fi
}

cmd_stop_all() {
    echo "=== Stopping Nexus Services ==="
    for svc in "${ALL_SERVICES[@]}"; do
        echo -n "  $svc ... "
        if _is_active "$svc"; then
            systemctl --user stop "$svc" 2>&1 | tail -1 || echo "FAILED"
        else
            echo "not running"
        fi
    done

    # Ensure Docker containers are cleaned up too
    echo "=== Cleaning up Docker containers ==="
    for svc in "${DOCKER_SERVICES[@]}"; do
        local container
        container=$(_docker_container_for "$svc")
        if [[ -n "$container" ]] && _docker_container_running "$container"; then
            echo -n "  $container ... "
            docker stop "$container" 2>&1 | tail -1 || echo "FAILED"
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
        if _in_array "$svc" "${ON_DEMAND_SERVICES[@]}"; then
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
    health)  cmd_health ;;
    stop)    cmd_stop_all ;;
    restart) cmd_restart_all ;;
    enable)  cmd_enable_all ;;
    *)
        echo "Usage: $0 {start|status|health|stop|restart|enable}"
        exit 1
        ;;
esac

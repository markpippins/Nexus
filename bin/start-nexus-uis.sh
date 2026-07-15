#!/bin/bash
# bin/start-nexus-uis.sh — bring up ALL Nexus UI dev servers in a tmux session
#
# Usage:
#   bin/start-nexus-uis.sh start    # start all nexus UIs (idempotent)
#   bin/start-nexus-uis.sh status   # show tmux session + port status
#   bin/start-nexus-uis.sh stop     # stop all nexus UIs (kill tmux session)
#   bin/start-nexus-uis.sh restart  # restart all nexus UIs
#   bin/start-nexus-uis.sh attach   # attach to the tmux session
#
# All UIs run in a single tmux session "nexus-uis" with one window per app.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_ROOT="$(cd "$NEXUS_ROOT/.." && pwd)"
SESSION="nexus-uis"

# ── UI list (name, relative_path_from_dev_root, start_command, port) ────
declare -A UI_PATHS
declare -A UI_COMMANDS
declare -A UI_PORTS

UI_NAMES=(
    "nexus-console"
    "conduit-ui"
    "tackle-ui"
    "nebula-ui"
    "duality-ui"
    "nexus-assembly"
    "cascade-ui"
    "view-architect"
)

UI_PATHS[nexus-console]="nexus/angular/nexus-console"
UI_COMMANDS[nexus-console]="npm start"
UI_PORTS[nexus-console]=4200

UI_PATHS[conduit-ui]="nexus/angular/conduit-ui"
UI_COMMANDS[conduit-ui]="npm start"
UI_PORTS[conduit-ui]=4201

UI_PATHS[tackle-ui]="nexus/angular/tackle-ui"
UI_COMMANDS[tackle-ui]="npm start"
UI_PORTS[tackle-ui]=4202

UI_PATHS[nebula-ui]="nexus/angular/nebula-ui"
UI_COMMANDS[nebula-ui]="npm run dev"
UI_PORTS[nebula-ui]=3000

UI_PATHS[duality-ui]="nexus/angular/duality-ui"
UI_COMMANDS[duality-ui]="npm run dev"
UI_PORTS[duality-ui]=3002

UI_PATHS[nexus-assembly]="nexus-assembly"
UI_COMMANDS[nexus-assembly]="npm run dev"
UI_PORTS[nexus-assembly]=9003

UI_PATHS[cascade-ui]="nexus/angular/cascade-ui"
UI_COMMANDS[cascade-ui]="npm start"
UI_PORTS[cascade-ui]=4203

UI_PATHS[view-architect]="nexus/angular/view-architect"
UI_COMMANDS[view-architect]="npm run dev"
UI_PORTS[view-architect]=3003

# ── Commands ────────────────────────────────────────────────────────────

tmux_session_exists() {
    tmux has-session -t "$SESSION" 2>/dev/null
}

port_is_listening() {
    ss -tln 2>/dev/null | awk -v p=":$1$" '$4 ~ p {found=1} END {exit !found}'
}

cmd_start_all() {
    echo "=== Starting Nexus UIs ==="

    if tmux_session_exists; then
        echo "Session '$SESSION' already exists — UIs are already running."
        echo "Use 'bin/start-nexus-uis.sh attach' to connect, or 'restart' to rebuild."
        cmd_status_all
        return 0
    fi

    # Create session with first UI
    local first="${UI_NAMES[0]}"
    local first_path="${UI_PATHS[$first]}"
    echo "  Creating session with $first (port ${UI_PORTS[$first]})"
    tmux new-session -d -s "$SESSION" -n "${first}" \
        "cd '$DEV_ROOT/$first_path' && echo '▶ Starting $first on :${UI_PORTS[$first]}' && ${UI_COMMANDS[$first]}"

    # Add remaining UIs as additional windows
    for ((i = 1; i < ${#UI_NAMES[@]}; i++)); do
        local name="${UI_NAMES[$i]}"
        local path="${UI_PATHS[$name]}"
        echo "  Adding window for $name (port ${UI_PORTS[$name]})"
        tmux new-window -t "$SESSION" -n "${name}" \
            "cd '$DEV_ROOT/$path' && echo '▶ Starting $name on :${UI_PORTS[$name]}' && ${UI_COMMANDS[$name]}"
    done

    echo
    echo "All UI windows created. Waiting for servers to bind..."
    sleep 5

    # Verify ports
    echo
    local all_up=true
    for name in "${UI_NAMES[@]}"; do
        local port="${UI_PORTS[$name]}"
        if port_is_listening "$port"; then
            echo "  ✅ $name — http://localhost:$port"
        else
            echo "  ⏳ $name — port $port not yet listening (may still be compiling)"
            all_up=false
        fi
    done

    echo
    if $all_up; then
        echo "All UIs are listening!"
    else
        echo "Some UIs are still compiling. Check with 'bin/start-nexus-uis.sh status'."
    fi
    echo "Attach with: tmux attach -t $SESSION  (Ctrl+B D to detach)"
    echo "=== Done ==="
}

cmd_status_all() {
    echo "=== Nexus UI Status ==="
    printf "%-22s %-6s %-12s %s\n" "UI" "PORT" "LISTENING" "URL"
    printf "%-22s %-6s %-12s %s\n" "--------------------" "------" "------------" "-------------------------"

    for name in "${UI_NAMES[@]}"; do
        local port="${UI_PORTS[$name]}"
        local listening="❌"
        if port_is_listening "$port"; then
            listening="✅"
        fi
        printf "%-22s %-6s %-12s http://localhost:%s\n" "$name" "$port" "$listening" "$port"
    done

    echo
    if tmux_session_exists; then
        echo "tmux session '$SESSION' exists."
        echo "Windows:"
        tmux list-windows -t "$SESSION" 2>/dev/null | while read -r line; do
            echo "  $line"
        done
        echo "Attach: tmux attach -t $SESSION"
    else
        echo "No tmux session '$SESSION' found."
    fi
}

cmd_stop_all() {
    echo "=== Stopping Nexus UIs ==="

    if tmux_session_exists; then
        tmux kill-session -t "$SESSION"
        echo "Session '$SESSION' killed."
    else
        echo "No tmux session '$SESSION' to stop."
    fi

    # Also kill any lingering dev servers on our ports (in case tmux didn't clean up)
    echo "Checking for lingering processes..."
    for name in "${UI_NAMES[@]}"; do
        local port="${UI_PORTS[$name]}"
        local pid
        pid=$(lsof -ti ":$port" 2>/dev/null || true)
        if [ -n "$pid" ]; then
            echo "  Killing process on port $port (PID $pid)"
            kill "$pid" 2>/dev/null || true
        fi
    done

    echo "=== Done ==="
}

cmd_restart_all() {
    cmd_stop_all
    sleep 2
    cmd_start_all
}

cmd_attach() {
    if tmux_session_exists; then
        exec tmux attach -t "$SESSION"
    else
        echo "No tmux session '$SESSION' running. Start it with 'bin/start-nexus-uis.sh start'."
        exit 1
    fi
}

# ── Main ────────────────────────────────────────────────────────────────

case "${1:-status}" in
    start)   cmd_start_all ;;
    status)  cmd_status_all ;;
    stop)    cmd_stop_all ;;
    restart) cmd_restart_all ;;
    attach)  cmd_attach ;;
    *)
        echo "Usage: $0 {start|status|stop|restart|attach}"
        exit 1
        ;;
esac

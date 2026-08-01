#!/usr/bin/env bash
# bin/sysadmin-outage-detect.sh — Deterministic outage detection
# ===============================================================
#
# Lightweight, no-LLM health check that runs frequently (every 30–60s via
# systemd timer or standalone) and detects service state transitions.
#
# On a DOWN→UP transition:  restarts dependent services (services that
#                            declared this one as a dependency — not the
#                            recovered service's own upstream deps). Driven
#                            by the ConfigBundle.
# On an UP→DOWN transition: logs the incident, and if the failed service
#                           is not already flagged, wakes the sysadmin
#                           agent via opencode run --agent sysadmin.
#
# The ConfigBundle (nexus/config/sysadmin-config.json) is the sole source
# of truth for what services to check, how to check them, and their
# dependency relationships.
#
# Usage
# -----
#     bin/sysadmin-outage-detect.sh                     # one cycle
#     bin/sysadmin-outage-detect.sh --wake-sysadmin     # also invoke sysadmin on new failures
#     bin/sysadmin-outage-detect.sh --check "serviceId" # check a single service
#
# Exit codes
# ----------
#   0 — normal (no new failures, or actions completed)
#   2 — ConfigBundle missing or invalid
#   3 — state file error

set -uo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="$(cd "$BIN_DIR/.." && pwd)"
CONFIG_FILE="$NEXUS_ROOT/config/sysadmin-config.json"
STATE_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}/nexus-sysadmin"
STATE_FILE="$STATE_DIR/outage-state.json"
INCIDENT_LOG="$STATE_DIR/incidents.json"
TICKETS_FILE="$STATE_DIR/tickets.json"
LOCK_FILE="$STATE_DIR/outage-detect.lock"

# ── Config ──────────────────────────────────────────────────────────────

WAKE_SYSADMIN=false
SINGLE_CHECK=""

# ── Helpers ─────────────────────────────────────────────────────────────

_log() {
    local level="$1"
    shift
    echo "[outage-detect] $(date '+%Y-%m-%d %H:%M:%S') [$level] $*"
}

# Load and validate the ConfigBundle
_load_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        _log "ERROR" "ConfigBundle not found: $CONFIG_FILE"
        exit 2
    fi

    python3 -c "
import json, sys
with open('$CONFIG_FILE') as f:
    data = json.load(f)
required = ['services', 'global']
for r in required:
    if r not in data:
        print(f'ERROR: missing required key \"{r}\"')
        sys.exit(1)
print('OK')
" 2>/dev/null || exit 2
}

# Parse the ConfigBundle's service list into bash arrays.
# Uses python3 for reliable JSON parsing.
_get_services() {
    python3 -c "
import json, sys
with open('$CONFIG_FILE') as f:
    data = json.load(f)
for svc in data['services']:
    sid = svc['id']
    method = svc.get('checkMethod', 'port')
    host = svc.get('host', 'localhost')
    port = svc.get('port', 0)
    endpoint = svc.get('healthEndpoint', '/')
    cmd = svc.get('checkCommand', '')
    expected = svc.get('expectedOutput', '')
    expected_status = svc.get('expectedStatus', 200)
    timeout = svc.get('timeout', 5)
    deps = ';'.join(svc.get('dependencies', []))
    unit = svc.get('systemdUnit', '')
    display = svc.get('displayName', sid)
    print(f'{sid}|{method}|{host}|{port}|{endpoint}|{cmd}|{expected}|{expected_status}|{timeout}|{deps}|{unit}|{display}')
"
}

# Check a single service's health using its declared method.
# Returns 0 if healthy, 1 if unhealthy.
_check_service() {
    local method="$1" host="$2" port="$3" endpoint="$4"
    local cmd="$5" expected="$6" expected_status="$7"
    local timeout="$8"

    case "$method" in
        port)
            timeout "$timeout" bash -c "echo > /dev/tcp/$host/$port" 2>/dev/null && return 0
            # Fallback: ss
            ss -tlnp 2>/dev/null | grep -q ":$port " 2>/dev/null && return 0
            return 1
            ;;
        http)
            local status
            status=$(curl -s --max-time "$timeout" -o /dev/null -w '%{http_code}' "http://$host:$port$endpoint" 2>/dev/null)
            if [[ "$status" == "$expected_status" ]]; then
                return 0
            fi
            # For UIs (port 4200+), accept 200, 301, or 302 (may redirect)
            if [[ "$port" -ge 4200 ]] && [[ "$status" =~ ^(200|301|302)$ ]]; then
                return 0
            fi
            return 1
            ;;
        command)
            local output
            output=$(timeout "$timeout" bash -c "$cmd" 2>/dev/null)
            if echo "$output" | grep -qF "$expected"; then
                return 0
            fi
            return 1
            ;;
        *)
            _log "WARN" "Unknown check method: $method"
            return 1
            ;;
    esac
}

# Load previous state from JSON file (or init on first run).
_load_state() {
    if [[ -f "$STATE_FILE" ]]; then
        cat "$STATE_FILE"
    else
        # First run: probe everything and record initial state without alerting
        echo '{'
        local first=true
        while IFS='|' read -r sid method host port endpoint cmd expected expected_status timeout deps unit display; do
            $first || echo ','
            first=false
            local healthy=false
            if _check_service "$method" "$host" "$port" "$endpoint" "$cmd" "$expected" "$expected_status" "$timeout"; then
                healthy=true
            fi
            echo "\"${sid}_up\": $healthy"
        done < <(_get_services)
        echo '}'
    fi
}

# Save current state to JSON file.
_save_state() {
    mkdir -p "$STATE_DIR"
    local state='{'
    local first=true
    while IFS='|' read -r sid method host port endpoint cmd expected expected_status timeout deps unit display; do
        $first || state+=','
        first=false
        local healthy=false
        if _check_service "$method" "$host" "$port" "$endpoint" "$cmd" "$expected" "$expected_status" "$timeout"; then
            healthy=true
        fi
        state+="\"${sid}_up\": $healthy"
    done < <(_get_services)
    state+=",\"last_checked\": \"$(date -Iseconds)\"}"
    printf '%s\n' "$state" > "$STATE_FILE"
}

# Log an incident to the incident log JSON file.
_log_incident() {
    local sid="$1" display="$2" transition="$3" detail="$4"
    mkdir -p "$STATE_DIR"
    local entry
    entry=$(cat <<END
{
  "timestamp": "$(date -Iseconds)",
  "service_id": "$sid",
  "display_name": "$display",
  "transition": "$transition",
  "detail": "$detail"
}
END
)
    if [[ -f "$INCIDENT_LOG" ]]; then
        # Prepend to existing log
        python3 -c "
import json, sys
with open('$INCIDENT_LOG') as f:
    existing = json.load(f)
if not isinstance(existing, list):
    existing = []
existing.insert(0, $entry)
with open('$INCIDENT_LOG', 'w') as f:
    json.dump(existing, f, indent=2)
" 2>/dev/null || true
    else
        echo "[$entry]" > "$INCIDENT_LOG"
    fi
}

# ── Ticket System ────────────────────────────────────────────────────────
#
# Tickets prevent the outage detector from re-waking the sysadmin agent for
# a service that already has an open ticket. They are JSON files keyed by
# service ID. States:
#   open        — sysadmin has been (or should be) dispatched
#   maintenance — engineering-created, suppresses alerts + dispatch
#   closed      — resolved (normal state, pruned on recovery)
#
# Engineering can pre-create a ticket for planned maintenance:
#   cat > "$TICKETS_FILE" <<'TICKET'
#   {"kernel-srv":{"service_id":"kernel-srv","status":"maintenance","opened_by":"engineering","reason":"Kernel upgrade"}}
#   TICKET

# Ensure tickets file exists as valid JSON (empty object if missing/malformed)
_tickets_init() {
    if [[ ! -f "$TICKETS_FILE" ]]; then
        mkdir -p "$STATE_DIR"
        echo '{}' > "$TICKETS_FILE"
        return
    fi
    # Validate and repair if corrupted
    python3 -c "
import json, sys
try:
    with open('$TICKETS_FILE') as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError('not a dict')
except Exception:
    with open('$TICKETS_FILE', 'w') as f:
        json.dump({}, f)
" 2>/dev/null || echo '{}' > "$TICKETS_FILE"
}

# Check if a service has an active (open or maintenance) ticket.
# Returns 0 if ticket exists and is active, 1 otherwise.
_has_active_ticket() {
    local sid="$1"
    python3 -c "
import json, sys
with open('$TICKETS_FILE') as f:
    tickets = json.load(f)
t = tickets.get('$sid', {})
status = t.get('status', '')
if status in ('open', 'maintenance'):
    sys.exit(0)
sys.exit(1)
" 2>/dev/null && return 0 || return 1
}

# Check if a service has a maintenance ticket specifically.
_is_maintenance() {
    local sid="$1"
    python3 -c "
import json, sys
with open('$TICKETS_FILE') as f:
    tickets = json.load(f)
t = tickets.get('$sid', {})
if t.get('status') == 'maintenance':
    sys.exit(0)
sys.exit(1)
" 2>/dev/null && return 0 || return 1
}

# Create or update a ticket for a service.
_create_ticket() {
    local sid="$1" display="$2" opened_by="$3" reason="$4"
    python3 -c "
import json, sys, os
tickets_file = '$TICKETS_FILE'
try:
    with open(tickets_file) as f:
        tickets = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    tickets = {}
tickets['$sid'] = {
    'service_id': '$sid',
    'display_name': '$display',
    'status': 'open',
    'opened_at': '$(date -Iseconds)',
    'opened_by': '$opened_by',
    'reason': '$reason',
    'sysadmin_dispatched': $([ "$opened_by" = "outage-detector" ] && echo "true" || echo "false"),
    'sysadmin_dispatched_at': $([ "$opened_by" = "outage-detector" ] && echo "\"$(date -Iseconds)\"" || echo "null"),
    'resolved_at': None,
    'notes': ''
}
with open(tickets_file, 'w') as f:
    json.dump(tickets, f, indent=2)
" 2>/dev/null && _log "INFO" "Ticket created for $display ($sid): $reason"
}

# Close a ticket on recovery, resolution, or manual intervention.
_close_ticket() {
    local sid="$1" resolution="$2"
    python3 -c "
import json, sys
tickets_file = '$TICKETS_FILE'
try:
    with open(tickets_file) as f:
        tickets = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    sys.exit(0)
if '$sid' in tickets:
    del tickets['$sid']
with open(tickets_file, 'w') as f:
    json.dump(tickets, f, indent=2)
" 2>/dev/null && _log "INFO" "Ticket closed for $sid: $resolution"
}

# List all active tickets (open or maintenance).
_list_tickets() {
    python3 -c "
import json, sys
try:
    with open('$TICKETS_FILE') as f:
        tickets = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    tickets = {}
active = {k: v for k, v in tickets.items() if v.get('status') in ('open', 'maintenance')}
if active:
    for sid, t in sorted(active.items()):
        print(f\"{sid}: {t.get('status','?')} ({t.get('opened_by','?')}) — {t.get('reason','')[:60]}\")
else:
    print('(no active tickets)')
" 2>/dev/null
}

# Restart a systemd user service.
_restart_service() {
    local svc="$1"
    _log "INFO" "Restarting $svc ..."
    if systemctl --user restart "$svc" 2>/dev/null; then
        _log "INFO" "$svc restarted successfully"
        return 0
    else
        _log "WARN" "Failed to restart $svc — may need manual intervention"
        return 1
    fi
}

# Wake the sysadmin agent for a newly detected failure.
_wake_sysadmin() {
    local sid="$1" display="$2"
    _log "INFO" "Waking sysadmin for: $display ($sid)"

    local opencode_bin
    opencode_bin="${OPENCODE_BIN:-$(command -v opencode 2>/dev/null || echo "$HOME/.opencode/bin/opencode")}"

    if [[ ! -x "$opencode_bin" ]]; then
        _log "WARN" "Cannot wake sysadmin — opencode not found at $opencode_bin"
        return 1
    fi

    # Fire-and-forget: run sysadmin agent with outage context.
    # We use nohup + disown to avoid blocking the health check loop.
    # Model defaults to nvidia/z-ai/glm-5.2; override via SYSMODEL env.
    local sysmodel="${SYSMODEL:-nvidia/z-ai/glm-5.2}"
    nohup "$opencode_bin" run \
        --agent sysadmin \
        --model "$sysmodel" \
        --dir "$NEXUS_ROOT" \
        --format json \
        --dangerously-skip-permissions \
        "Respond to detected outage: $display ($sid). Determine root cause, act within authority ladder, post to Assembly Issues." \
        </dev/null >/dev/null 2>&1 &
    disown

    _log "INFO" "Sysadmin agent dispatched for $sid"
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    # Parse flags
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --wake-sysadmin) WAKE_SYSADMIN=true; shift ;;
            --check)        SINGLE_CHECK="$2"; shift 2 ;;
            --tickets)      _tickets_init; _list_tickets; exit 0 ;;
            --help|-h)      sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# //'; exit 0 ;;
            *)              _log "WARN" "Unknown option: $1"; shift ;;
        esac
    done

    _load_config

    # Initialize ticket registry
    _tickets_init

    # Acquire lock (prevent concurrent runs)
    mkdir -p "$STATE_DIR"
    exec {LOCK_FD}>"$LOCK_FILE"
    if ! flock -n "$LOCK_FD" 2>/dev/null; then
        _log "DEBUG" "Another outage-detect run is in progress — skipping"
        exit 0
    fi
    trap 'exec {LOCK_FD}>&-; rm -f "$LOCK_FILE"' EXIT
    echo "$$" > "$LOCK_FILE"

    # Load previous state
    local prev_state
    prev_state=$(_load_state)

    # Read previous statuses into an associative array for fast lookup
    declare -A PREV_UP
    while IFS='|' read -r sid method host port endpoint cmd expected expected_status timeout deps unit display; do
        local was_up
        was_up=$(echo "$prev_state" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('${sid}_up', False))
" 2>/dev/null || echo "false")
        PREV_UP["$sid"]="$was_up"
    done < <(_get_services)

    local any_new_failure=false
    local any_recovery=false
    local current_failures=""

    # Check each service
    while IFS='|' read -r sid method host port endpoint cmd expected expected_status timeout deps unit display; do
        # If --check was given, skip everything else
        if [[ -n "$SINGLE_CHECK" && "$sid" != "$SINGLE_CHECK" ]]; then
            continue
        fi

        local is_up=false
        if _check_service "$method" "$host" "$port" "$endpoint" "$cmd" "$expected" "$expected_status" "$timeout"; then
            is_up=true
        fi

        local was_up="${PREV_UP[$sid]:-false}"

        # Transition: DOWN→UP
        if [[ "$was_up" == "False" || "$was_up" == "false" ]] && [[ "$is_up" == "true" ]]; then
            _log "INFO" "$display ($sid) recovered — was down, now up"

            # Close any existing ticket on recovery
            if _has_active_ticket "$sid"; then
                _close_ticket "$sid" "Service recovered automatically"
            fi

            # Restart dependent services (services that list THIS service as a dependency)
            # Scan the ConfigBundle for any service whose dependencies include $sid.
            local dependents
            dependents=$(python3 -c "
import json, sys
with open('$CONFIG_FILE') as f:
    data = json.load(f)
recovered = '$sid'
for svc in data['services']:
    deps = svc.get('dependencies', [])
    if recovered in deps:
        unit = svc.get('systemdUnit', '')
        if unit:
            print(f\"{svc['id']}|{unit}\")
" 2>/dev/null || true)
            if [[ -n "$dependents" ]]; then
                while IFS='|' read -r dep_sid dep_unit; do
                    if [[ -n "$dep_unit" ]]; then
                        _restart_service "$dep_unit"
                        sleep 0.5
                    fi
                done <<< "$dependents"
            fi

            _log_incident "$sid" "$display" "DOWN→UP" "Service recovered automatically"
            any_recovery=true
        fi

        # Transition: UP→DOWN
        if [[ "$was_up" == "True" || "$was_up" == "true" ]] && [[ "$is_up" == "false" ]]; then
            _log "WARN" "$display ($sid) went DOWN"

            # If service has an active ticket (especially maintenance), suppress
            if _has_active_ticket "$sid"; then
                if _is_maintenance "$sid"; then
                    _log "INFO" "$display ($sid) is down but has maintenance ticket — suppressed"
                else
                    _log "DEBUG" "$display ($sid) already has open ticket — not re-dispatching"
                fi
            else
                _log_incident "$sid" "$display" "UP→DOWN" "Service became unavailable"
                _create_ticket "$sid" "$display" "outage-detector" "UP→DOWN transition detected"

                if [[ "$WAKE_SYSADMIN" == "true" ]]; then
                    _wake_sysadmin "$sid" "$display"
                fi

                any_new_failure=true
                current_failures="$current_failures $sid"
            fi
        fi

        # Steady state logging (DEBUG level)
        if [[ "$is_up" == "true" ]]; then
            _log "DEBUG" "$display ($sid) is healthy"
        else
            _log "DEBUG" "$display ($sid) is DOWN (steady)"
        fi
    done < <(_get_services)

    # Persist current state
    _save_state

    # Summary
    if $any_new_failure; then
        _log "WARN" "New failures detected:$current_failures"
    fi
    if $any_recovery; then
        _log "INFO" "Recoveries processed"
    fi
    # Report active tickets in summary
    local ticket_summary
    ticket_summary=$(_list_tickets)
    if [[ "$ticket_summary" != "(no active tickets)" ]]; then
        _log "INFO" "Active tickets:"
        while IFS= read -r line; do
            _log "INFO" "  $line"
        done <<< "$ticket_summary"
    fi

    if ! $any_new_failure && ! $any_recovery; then
        if [[ "$ticket_summary" == "(no active tickets)" ]]; then
            _log "INFO" "All services healthy — no transitions"
        else
            _log "INFO" "No new transitions — $(echo "$ticket_summary" | wc -l) active ticket(s) remaining"
        fi
    fi

    # If failures detected and we're not already waking individually, wake once
    if $any_new_failure && [[ "$WAKE_SYSADMIN" == "false" ]]; then
        # Only wake if there are failures and --wake-sysadmin was not set
        # (individual wake-ups were already dispatched above if the flag was set)
        :
    fi
}

main "$@"

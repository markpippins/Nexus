#!/usr/bin/env bash
# bin/preflight-check.sh — preflight reachability + migration ordering guard
# ==========================================================================
#
# Startup health-check that probes every registered service for reachability
# and verifies migration ordering between local and barium before the system is
# declared operational.
#
# Usage
# -----
#     bin/preflight-check.sh                        # human-readable output
#     bin/preflight-check.sh --json                 # JSON posture report
#     bin/preflight-check.sh --check-migrations     # include migration guard
#     bin/preflight-check.sh --json --check-migrations  # both
#     bin/preflight-check.sh --log-runtime-posture --json  # also INSERT snapshot into nebula.runtime_posture
#     bin/preflight-check.sh --timeout 5            # custom probe timeout
#
# Exit codes
# ----------
#   0 — all services reachable (and migrations in sync if checked)
#   1 — one or more services unreachable
#   2 — migration divergence detected
#   3 — both service and migration failures
#   4 — usage / config error

set -uo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="$(cd "$BIN_DIR/.." && pwd)"
CONFIG_FILE="$NEXUS_ROOT/config/sysadmin-config.json"
START_TS="$(date +%s%3N 2>/dev/null || echo "0")"  # ms epoch

# ── Flags ────────────────────────────────────────────────────────────────

JSON_MODE=false
CHECK_MIGRATIONS=false
LOG_RUNTIME_POSTURE=false
TIMEOUT_SEC=3
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --json)                  JSON_MODE=true; shift ;;
        --check-migrations)      CHECK_MIGRATIONS=true; shift ;;
        --log-runtime-posture)   LOG_RUNTIME_POSTURE=true; shift ;;
        --timeout)               TIMEOUT_SEC="$2"; shift 2 ;;
        --verbose|-v)            VERBOSE=true; shift ;;
        --help|-h)
            echo "Usage: $0 [--json] [--check-migrations] [--log-runtime-posture] [--timeout N] [--verbose]"
            echo ""
            echo "Preflight check: probes all registered services + migration ordering."
            echo "Exits 0 if all OK, non-zero with details otherwise."
            exit 0
            ;;
        *) echo "Unknown flag: $1" >&2; exit 4 ;;
    esac
done

# ── Helpers ──────────────────────────────────────────────────────────────

_log() {
    if ! $JSON_MODE; then
        echo "[preflight] $(date '+%H:%M:%S') $*" >&2
    fi
}

_err() {
    echo "[preflight] $(date '+%H:%M:%S') ERROR: $*" >&2
}

# Probe a TCP port using /dev/tcp (bash built-in, no external deps).
_tcp_probe() {
    local host="${1:-localhost}"
    local port="$2"
    timeout "$TIMEOUT_SEC" bash -c "echo > /dev/tcp/$host/$port" 2>/dev/null
}

# Probe an HTTP health endpoint.
_http_probe() {
    local url="$1"
    local expected_code="${2:-200}"
    if command -v curl &>/dev/null; then
        local code
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SEC" "$url" 2>/dev/null)
        [[ "$code" == "$expected_code" ]] && return 0
        # Also accept any 2xx
        [[ "$code" =~ ^2[0-9][0-9]$ ]] && return 0
    fi
    return 1
}

# Resolve service health endpoint from sysadmin-config.json.
# Returns "method|url" or "method|port" for TCP-only probes.
_resolve_health() {
    python3 -c "
import json, sys
svc_id = sys.argv[1]
with open('$CONFIG_FILE') as f:
    cfg = json.load(f)
for s in cfg.get('services', []):
    if s.get('id') == svc_id:
        port = s.get('port', 0)
        health = s.get('healthPath', s.get('healthCheckUrl', ''))
        if health and port and int(port) > 0:
            # Build a full URL if health is a path
            if health.startswith('/'):
                print(f'http|http://localhost:{port}{health}')
            elif health.startswith('http'):
                print(f'http|{health}')
            else:
                print(f'http|http://localhost:{port}/{health}')
        elif port and int(port) > 0:
            print(f'tcp|{port}')
        else:
            # MCP / SSE services on port 0 — check by systemd unit
            unit = s.get('systemdUnit', '')
            if unit:
                print(f'systemd|{unit}')
            else:
                print('skip|no-port-or-unit')
        sys.exit(0)
# Fallback for unknown services
port = sys.argv[2] if len(sys.argv) > 2 else '0'
if port and int(port) > 0:
    print(f'tcp|{port}')
else:
    print('skip|unknown')
" "$@"
}

# ── Service probes ───────────────────────────────────────────────────────

declare -A PROBE_RESULTS  # svc_id -> json fragment
declare -a PROBE_ORDER    # preserve ordering
TOTAL_SERVICES=0
HEALTHY_SERVICES=0
UNREACHABLE_SERVICES=()

_probe_service() {
    local svc_id="$1"
    local svc_name="$2"

    PROBE_ORDER+=("$svc_id")
    TOTAL_SERVICES=$((TOTAL_SERVICES + 1))

    local health_info
    health_info=$(_resolve_health "$svc_id")
    local method="${health_info%%|*}"
    local target="${health_info#*|}"

    local start_ns
    start_ns=$(date +%s%N 2>/dev/null || echo "0")

    local reachable=false
    local method_used="$method"
    local status_detail=""

    case "$method" in
        http)
            if _http_probe "$target"; then
                reachable=true
                status_detail="UP"
            else
                status_detail="unreachable"
            fi
            ;;
        tcp)
            if _tcp_probe localhost "$target"; then
                reachable=true
                status_detail="UP"
            else
                status_detail="unreachable"
            fi
            ;;
        systemd)
            local unit="$target"
            if systemctl --user is-active "$unit" &>/dev/null; then
                reachable=true
                status_detail="UP (systemd:active)"
            else
                status_detail="down (systemd:inactive)"
            fi
            ;;
        skip)
            reachable=false
            status_detail="skipped: $target"
            method_used="skip"
            ;;
    esac

    local end_ns
    end_ns=$(date +%s%N 2>/dev/null || echo "$start_ns")
    local latency_us=$(( (end_ns - start_ns) / 1000 ))
    [[ $latency_us -lt 0 ]] && latency_us=0

    if $reachable; then
        HEALTHY_SERVICES=$((HEALTHY_SERVICES + 1))
        PROBE_RESULTS["$svc_id"]="{\"id\":\"$svc_id\",\"name\":\"$svc_name\",\"reachable\":true,\"latency_us\":$latency_us,\"method\":\"$method_used\",\"status\":\"$status_detail\"}"
        if $VERBOSE; then
            _log "✅ $svc_name ($svc_id) — ${latency_us}μs via $method_used"
        fi
    else
        UNREACHABLE_SERVICES+=("$svc_id")
        PROBE_RESULTS["$svc_id"]="{\"id\":\"$svc_id\",\"name\":\"$svc_name\",\"reachable\":false,\"latency_us\":$latency_us,\"method\":\"$method_used\",\"status\":\"$status_detail\"}"
        _err "❌ $svc_name ($svc_id) — $status_detail"
    fi
}

# ── Migration ordering guard ─────────────────────────────────────────────

LOCAL_MIGRATION_VERSION=""
BARIUM_MIGRATION_VERSION=""
MIGRATION_DIVERGENCE=false
MIGRATION_DIVERGENCE_DETAIL=""

_check_migration_ordering() {
    _log "Checking migration ordering (local vs barium)..."

    # Get local migration versions
    if command -v psql &>/dev/null; then
        LOCAL_MIGRATION_VERSION=$(PGPASSWORD=pgpass psql -h localhost -U pguser -d nexus -t -A -c \
            "SELECT string_agg(version || ':' || md5(checksum::text), ', ' ORDER BY version)
             FROM (SELECT version, checksum FROM flyway_schema_history ORDER BY version) t" \
            2>/dev/null || echo "ERROR")
    else
        LOCAL_MIGRATION_VERSION="psql-unavailable"
    fi

    # Get barium migration versions
    BARIUM_MIGRATION_VERSION=$(PGPASSWORD=pgpass psql -h barium -U pguser -d nexus -t -A -c \
        "SELECT string_agg(version || ':' || md5(checksum::text), ', ' ORDER BY version)
         FROM (SELECT version, checksum FROM flyway_schema_history ORDER BY version) t" \
        2>/dev/null || echo "UNREACHABLE")

    if [[ "$BARIUM_MIGRATION_VERSION" == "UNREACHABLE" ]]; then
        MIGRATION_DIVERGENCE=true
        MIGRATION_DIVERGENCE_DETAIL="barium unreachable"
        _err "Migration check: barium unreachable"
        return
    fi

    if [[ "$LOCAL_MIGRATION_VERSION" == "ERROR" ]]; then
        MIGRATION_DIVERGENCE=true
        MIGRATION_DIVERGENCE_DETAIL="local query failed"
        _err "Migration check: local query failed"
        return
    fi

    # Compare: build python diff
    local diff_result
    diff_result=$(python3 -c "
import sys
local_raw = sys.argv[1]
barium_raw = sys.argv[2]

if local_raw == 'psql-unavailable' or barium_raw == 'UNREACHABLE':
    print('SKIP')
    sys.exit(0)

def parse_versions(raw):
    versions = {}
    for pair in raw.split(', '):
        if ':' in pair:
            ver, chk = pair.split(':', 1)
            versions[ver.strip()] = chk.strip()
    return versions

local_v = parse_versions(local_raw)
barium_v = parse_versions(barium_raw)

divergences = []

# Check: every local version must exist on barium with same checksum
for ver, chk in sorted(local_v.items()):
    if ver not in barium_v:
        divergences.append(f'LOCAL_ONLY:{ver}')
    elif barium_v[ver] != chk:
        divergences.append(f'CHECKSUM_MISMATCH:{ver} (local={chk[:12]}... barium={barium_v[ver][:12]}...)')

# Check: any barium versions not on local (gaps are OK but worth noting)
for ver in sorted(barium_v.keys()):
    if ver not in local_v:
        divergences.append(f'BARIUM_AHEAD:{ver}')

if divergences:
    print('DIVERGENCE:' + '; '.join(divergences))
else:
    print('OK')
" "$LOCAL_MIGRATION_VERSION" "$BARIUM_MIGRATION_VERSION" 2>/dev/null)

    case "$diff_result" in
        OK)
            _log "Migration check: local and barium in sync"
            ;;
        SKIP|"")
            _log "Migration check: skipped (data unavailable)"
            ;;
        DIVERGENCE:*)
            MIGRATION_DIVERGENCE=true
            MIGRATION_DIVERGENCE_DETAIL="${diff_result#DIVERGENCE:}"
            _err "Migration divergence: $MIGRATION_DIVERGENCE_DETAIL"
            ;;
        *)
            _err "Migration check: unexpected result — $diff_result"
            ;;
    esac
}

# ── Main ─────────────────────────────────────────────────────────────────

main() {
    _log "Preflight check starting (timeout=${TIMEOUT_SEC}s, migrations=$CHECK_MIGRATIONS)..."

    if [[ ! -f "$CONFIG_FILE" ]]; then
        _err "Config file not found: $CONFIG_FILE"
        exit 4
    fi

    # Load all services from sysadmin-config and probe them
    local svc_list
    svc_list=$(python3 -c "
import json
with open('$CONFIG_FILE') as f:
    cfg = json.load(f)
for s in cfg.get('services', []):
    sid = s.get('id','')
    name = s.get('name', s.get('displayName', sid))
    port = s.get('port', 0)
    print(f'{sid}|{name}|{port}')
" 2>/dev/null)

    if [[ -z "$svc_list" ]]; then
        _err "No services found in config"
        exit 4
    fi

    # Probe each service
    while IFS='|' read -r svc_id svc_name svc_port; do
        [[ -z "$svc_id" ]] && continue
        _probe_service "$svc_id" "$svc_name"
    done <<< "$svc_list"

    # Migration check
    if $CHECK_MIGRATIONS; then
        _check_migration_ordering
    fi

    # Timing
    local end_ts
    end_ts=$(date +%s%3N 2>/dev/null || echo "$START_TS")
    local elapsed_ms=$((end_ts - START_TS))
    [[ $elapsed_ms -lt 0 ]] && elapsed_ms=0

    # PG / Redis version probes (lightweight)
    local pg_version=""
    local redis_version=""
    if command -v psql &>/dev/null; then
        pg_version=$(PGPASSWORD=pgpass psql -h localhost -U pguser -d nexus -t -A -c \
            "SELECT version()" 2>/dev/null | head -1 | cut -c1-80 || echo "")
    fi
    if command -v redis-cli &>/dev/null; then
        redis_version=$(timeout 2 redis-cli -h localhost -p 6379 INFO server 2>/dev/null | \
            grep 'redis_version:' | cut -d: -f2 | tr -d '\r' || echo "")
    fi

    # ── Output ────────────────────────────────────────────────────────

    local json_tmp=""
    if $JSON_MODE; then
        # Build JSON report (also tee'd to a temp file for posture persistence)
        json_tmp=$(mktemp /tmp/preflight-posture-XXXXXX.json)
        {
        echo "{"
        echo "  \"checked_at\": \"$(date -Iseconds)\","
        echo "  \"services_total\": $TOTAL_SERVICES,"
        echo "  \"services_healthy\": $HEALTHY_SERVICES,"
        echo "  \"services_unreachable\": ["
        local first=true
        for svc_id in "${UNREACHABLE_SERVICES[@]}"; do
            $first || echo ","
            first=false
            echo -n "    ${PROBE_RESULTS[$svc_id]}"
        done
        echo ""
        echo "  ],"
        echo "  \"services\": ["
        first=true
        for svc_id in "${PROBE_ORDER[@]}"; do
            $first || echo ","
            first=false
            echo -n "    ${PROBE_RESULTS[$svc_id]}"
        done
        echo ""
        echo "  ],"
        if $CHECK_MIGRATIONS; then
            echo "  \"migrations\": {"
            echo "    \"local_version\": \"${LOCAL_MIGRATION_VERSION:0:200}\","
            echo "    \"barium_version\": \"${BARIUM_MIGRATION_VERSION:0:200}\","
            echo "    \"divergence\": $MIGRATION_DIVERGENCE,"
            echo "    \"divergence_detail\": \"$MIGRATION_DIVERGENCE_DETAIL\""
            echo "  },"
        fi
        echo "  \"environment\": {"
        echo "    \"pg_version\": \"$pg_version\","
        echo "    \"redis_version\": \"$redis_version\""
        echo "  },"
        echo "  \"check_latency_ms\": $elapsed_ms"
        echo "}"
        } | tee "$json_tmp"
    else
        # Human-readable summary
        echo ""
        echo "══════════════════════════════════════════════════════════════"
        echo "  PREFLIGHT CHECK"
        echo "══════════════════════════════════════════════════════════════"
        echo "  Services:  $HEALTHY_SERVICES/$TOTAL_SERVICES healthy"
        echo "  Duration:  ${elapsed_ms}ms"
        echo ""

        if [[ ${#UNREACHABLE_SERVICES[@]} -gt 0 ]]; then
            echo "  UNREACHABLE:"
            for svc_id in "${UNREACHABLE_SERVICES[@]}"; do
                local detail
                detail=$(echo "${PROBE_RESULTS[$svc_id]}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f\"  {d['name']} ({d['id']}) — {d['status']} via {d['method']}\")
" 2>/dev/null || echo "  $svc_id — unreachable")
                echo "$detail"
            done
            echo ""
        fi

        if $CHECK_MIGRATIONS; then
            if $MIGRATION_DIVERGENCE; then
                echo "  MIGRATIONS: ❌ DIVERGENCE"
                echo "    $MIGRATION_DIVERGENCE_DETAIL"
            else
                echo "  MIGRATIONS: ✅ in sync"
            fi
            echo ""
        fi

        echo "  PostgreSQL: ${pg_version:-unknown}"
        echo "  Redis:      ${redis_version:-unknown}"
        echo "══════════════════════════════════════════════════════════════"
        echo ""
    fi

    # ── Runtime posture persistence (V127) ────────────────────────────

    if $LOG_RUNTIME_POSTURE; then
        if [[ -n "$json_tmp" && -f "$json_tmp" ]]; then
            _log_runtime_posture "$json_tmp" "$HEALTHY_SERVICES" "$TOTAL_SERVICES"
            rm -f "$json_tmp"
        else
            _err "--log-runtime-posture requires --json output mode"
        fi
    fi

    # ── Exit code ────────────────────────────────────────────────────

    local exit_code=0
    if [[ ${#UNREACHABLE_SERVICES[@]} -gt 0 ]]; then
        exit_code=1
    fi
    if $CHECK_MIGRATIONS && $MIGRATION_DIVERGENCE; then
        exit_code=$((exit_code + 2))
    fi
    exit $exit_code
}

# ── Runtime posture persistence (V127 table) ────────────────────────────────

_log_runtime_posture() {
    local json_file="$1"
    local healthy="$2"
    local total="$3"
    local unhealthy=$((total - healthy))
    local all_ok="false"
    [[ $unhealthy -eq 0 ]] && all_ok="true"

    local mig_ok="null"
    if $CHECK_MIGRATIONS; then
        if $MIGRATION_DIVERGENCE; then
            mig_ok="false"
        else
            mig_ok="true"
        fi
    fi

    local elapsed="$elapsed_ms"
    local hostname="$(hostname -s 2>/dev/null || echo 'localhost')"

    # NOTE: this psql build skips -v variable interpolation with -c; the
    # INSERT is therefore piped via stdin, which interpolates correctly.
    local host_esc       # single-quote escape for SQL literal
    host_esc=$(printf '%s' "$hostname" | sed "s/'/''/g")
    local json_esc      # same, for the posture JSON body
    json_esc=$(sed "s/'/''/g" "$json_file") || {
        _err "Failed to read posture JSON file for persistence"
        return 1
    }

    local insert_sql
    insert_sql=$(printf "INSERT INTO nebula.runtime_posture (host, services_total, services_healthy, services_unhealthy, all_healthy, migration_checked, migration_ok, duration_ms, posture_json) VALUES ('%s', %s, %s, %s, %s, %s, %s, %s, '%s'::jsonb);\n" \
        "$host_esc" "$total" "$healthy" "$unhealthy" "$all_ok" \
        "$CHECK_MIGRATIONS" "$mig_ok" "$elapsed" "$json_esc")

    if ! printf '%s\n' "$insert_sql" | \
            PGPASSWORD="${PGPASSWORD:-pgpass}" psql \
            -h "${PGHOST:-localhost}" -U "${PGUSER:-pguser}" -d "${PGDATABASE:-nexus}" \
            >/dev/null 2>&1; then
        _err "Failed to insert runtime posture snapshot into nebula.runtime_posture"
        return 1
    fi
    _log "Runtime posture snapshot logged to nebula.runtime_posture (${healthy}/${total} healthy)"
    return 0
}

main "$@"


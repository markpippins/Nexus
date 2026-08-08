#!/bin/bash
# bin/tackle-projector.sh — CLI for tackle-srv ACP projection engine
#
# Usage:
#   tackle-projector.sh render <name|all> [--force]  # render projection(s)
#   tackle-projector.sh status                       # list all projections
#   tackle-projector.sh drift                        # show drift report
#
# Requires tackle-srv to be running on port 3410.

set -e

TACKLE_SRV="${TACKLE_SRV_URL:-http://localhost:3410}"

# ── Helpers ──────────────────────────────────────────────────────

# Curl wrapper that fails gracefully if tackle-srv is unreachable
_curl() {
    local result
    result=$(curl -s --max-time 10 "$@" 2>&1) || {
        echo "Error: tackle-srv unreachable at ${TACKLE_SRV}"
        exit 1
    }
    if [[ -z "$result" ]]; then
        echo "Error: tackle-srv returned empty response at ${TACKLE_SRV}"
        exit 1
    fi
    echo "$result"
}

# ── Help ──────────────────────────────────────────────────────────

show_help() {
    cat <<EOF
Usage: tackle-projector.sh {render|status|drift} [args]

Commands:
  render <name|all> [--force]   Render named projection or all enabled
  status                        List all projection configs
  drift                         Show drift report (on-disk vs stored sha)

Environment:
  TACKLE_SRV_URL   tackle-srv base URL (default: http://localhost:3410)
EOF
}

# ── Status ────────────────────────────────────────────────────────

cmd_status() {
    _curl "${TACKLE_SRV}/projections" | python3 -c '
import json, sys
data = json.load(sys.stdin)
projs = data.get("projections", [])
print(f"{len(projs)} projections")
print(f"{'NAME':<30} {'EN':<4} {'TYPE':<14} {'TARGET':<50}")
print("-" * 100)
for p in projs:
    en = "✓" if p.get("enabled") else "✗"
    print(f"{p[\"name\"]:<30} {en:<4} {p[\"type\"]:<14} {p[\"target_path\"]:<50}")
'
}

# ── Render ────────────────────────────────────────────────────────

cmd_render() {
    local target="${1:-all}"
    local force=false
    if [[ "${2:-}" == "--force" ]]; then force=true; fi

    if [[ "$target" == "all" ]]; then
        echo "Rendering all enabled projections..."
        local result
        result=$(_curl -X POST "${TACKLE_SRV}/projections/render-all")
        echo "$result" | python3 -c '
import json, sys
data = json.load(sys.stdin)
print(f"Total: {data.get(\"total\",0)}  Written: {data.get(\"written\",0)}  Skipped: {data.get(\"skipped\",0)}  Backed up: {data.get(\"backedUp\",0)}")
for e in data.get("entries", []):
    flag = ""
    if e.get("backedUp"): flag = " [BACKED UP]"
    elif e.get("written"): flag = " [WRITTEN]"
    else: flag = " [unchanged]"
    print(f"  {e[\"target_path\"]}{flag}")
'
    else
        # Render single named projection — need to get its ID first
        local proj
        proj=$(_curl "${TACKLE_SRV}/projections" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for p in data.get('projections', []):
    if p['name'] == '$target':
        print(p['id'])
        break
")
        if [[ -z "$proj" ]]; then
            echo "Error: projection '$target' not found"
            return 1
        fi
        echo "Rendering projection '$target' (id: $proj)..."
        local result
        result=$(_curl -X POST "${TACKLE_SRV}/projections/${proj}/render")
        echo "$result" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for e in data.get("entries", []):
    flag = ""
    if e.get("backedUp"): flag = " [BACKED UP]"
    elif e.get("written"): flag = " [WRITTEN]"
    else: flag = " [unchanged]"
    print(f"  {e[\"target_path\"]}{flag}")
'
    fi
}

# ── Drift ─────────────────────────────────────────────────────────

cmd_drift() {
    echo "Checking projection drift..."
    _curl "${TACKLE_SRV}/projections/drift" | python3 -c '
import json, sys
data = json.load(sys.stdin)
print(f"Total: {data.get(\"total\",0)}  Drifted: {data.get(\"drifted\",0)}  Clean: {data.get(\"clean\",0)}")
for e in data.get("entries", []):
    if e.get("drift"):
        flag = " [DRIFTED]"
    elif e.get("missing"):
        flag = " [MISSING]"
    else:
        flag = ""
    if flag:
        print(f"  {e[\"target_path\"]}{flag}")
'
}

# ── Main ──────────────────────────────────────────────────────────

case "${1:-help}" in
    render)  shift; cmd_render "$@" ;;
    status)  cmd_status ;;
    drift)   cmd_drift ;;
    help|-h|--help) show_help ;;
    *)
        echo "Unknown command: ${1:-}"
        show_help
        exit 1
        ;;
esac

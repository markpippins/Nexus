#!/usr/bin/env bash
#
# bin/mesh-status.sh — READ-ONLY companion to bin/mesh-register.py
# =================================================================
#
# Polls `curl /health` against every CANDIDATE in `bin/mesh-register.py`'s
# `CANDIDATES` list (single source of truth — we ``importlib``-load the
# Python module and read the tuple, so adding a new service to
# CANDIDATES is the only edit needed) and emits a fixed-width table
# summarising reachability, HTTP status, latency, and a body excerpt.
#
# This is the inbox-attention surface the AGENTS.md engineer Bootstrap
# Self-Update relies on: read the table, see which services are
# reachable before deciding to write. For state-mutating work, use
# `bin/mesh-register.py` (or its bring-up sidecar `bin/mesh-monitor.py`).
#
# Usage
# -----
#
# ::
#
#     bin/mesh-status.sh              # one-shot probe + table (default timeout 2s)
#     PROBE_TIMEOUT_SECONDS=5 bin/mesh-status.sh
#     MESH_REGISTER=/path/to/mesh-register.py bin/mesh-status.sh
#
# Exit codes
# ----------
#
# * ``0`` — script ran end-to-end. Caller reads the table; the script
#   itself never reflects reachability in its own exit code (a single
#   offline service should not poison the operator's $?).
# * ``1`` — could not run `mesh-register.py` or extract CANDIDATES.

set -uo pipefail

BIN_DIR=$(cd "$(dirname "$0")" && pwd)
MESH_REGISTER="${MESH_REGISTER:-$BIN_DIR/mesh-register.py}"
PROBE_TIMEOUT_SECONDS="${PROBE_TIMEOUT_SECONDS:-2}"

if [ ! -f "$MESH_REGISTER" ]; then
  echo "mesh-status: $MESH_REGISTER not found" >&2
  exit 1
fi

# Step 1 — pull the (name, port, kind, url) tuples from mesh-register.py's
# CANDIDATES. Use importlib (script has a hyphen — direct `python3 mr.py`
# works too, but importlib gives us a stable surface). The dataclass
# introspects ``sys.modules``, so register first per the 2026-06-23 audit.
CANDIDATES_TSV=$(python3 - "$MESH_REGISTER" <<'PYEOF'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("mr", sys.argv[1])
mr = importlib.util.module_from_spec(spec)
sys.modules["mr"] = mr
spec.loader.exec_module(mr)
out = []
for c in mr.CANDIDATES:
    port = "-" if c.port is None else str(c.port)
    url = c.health_url or "-"
    cmd = c.health_cmd or "-"
    out.append(f"{c.name}|{port}|{c.kind}|{url}|{cmd}")
sys.stdout.write("\n".join(out))
sys.stdout.write("\n")
PYEOF
)
if [ $? -ne 0 ]; then
  echo "mesh-status: failed to extract CANDIDATES from $MESH_REGISTER" >&2
  exit 1
fi

# Step 2 — probe each candidate. Build pipe-delimited rows so the table
# is aligned by `column -t -s '|'` at the end.
TMP_STATUS=$(mktemp -d)
trap 'rm -rf "$TMP_STATUS"' EXIT

declare -a ROWS
ROWS+=("name|port|kind|reachable|status|latency_ms|excerpt")
ROWS+=("----|----|----|----------|------|----------|-------")

online_count=0
offline_count=0
total_count=0

while IFS='|' read -r name port kind url cmd; do
  [ -z "$name" ] && continue
  total_count=$((total_count + 1))

  # Restore sentinels
  [ "$port" = "-" ] && port=""
  [ "$url" = "-" ] && url=""
  [ "$cmd" = "-" ] && cmd=""

  # ── No health URL — try health_cmd if available ──────────────────
  if [ -z "$url" ]; then
    if [ -n "$cmd" ]; then
      if timeout "$PROBE_TIMEOUT_SECONDS" bash -c "$cmd" > /dev/null 2>&1; then
        ROWS+=("${name}|${port}|${kind}|yes|200|0|health_cmd ok")
        online_count=$((online_count + 1))
      else
        ROWS+=("${name}|${port}|${kind}|no|-|----|health_cmd failed")
        offline_count=$((offline_count + 1))
      fi
    else
      ROWS+=("${name}|${port}|${kind}|no|-|----|no health URL")
      offline_count=$((offline_count + 1))
    fi
    continue
  fi
  curl --silent --max-time "$PROBE_TIMEOUT_SECONDS" \
       --output "$TMP_STATUS/body" \
       --write-out '%{http_code}|%{time_total}\n' \
       "$url" > "$TMP_STATUS/meta" 2>/dev/null
  meta=$(tr -d '\r\n' < "$TMP_STATUS/meta" 2>/dev/null || true)
  http_code="${meta%%|*}"
  time_s="${meta##*|}"
  if [ -z "$http_code" ]; then
    ROWS+=("${name}|${port}|${kind}|no|t/o|----|curl failure")
    offline_count=$((offline_count + 1))
    continue
  fi
  reachable=yes
  case "$http_code" in
    [45]??) reachable=no ;;
    000)    reachable=no ;;
  esac
  if [ "$reachable" = "yes" ]; then
    online_count=$((online_count + 1))
  else
    offline_count=$((offline_count + 1))
  fi
  latency_ms=$(awk -v t="$time_s" 'BEGIN { printf("%d", (t+0)*1000) }' 2>/dev/null || echo "----")
  excerpt=$(tr '\n' ' ' < "$TMP_STATUS/body" 2>/dev/null | cut -c1-40 || true)
  ROWS+=("${name}|${port}|${kind}|${reachable}|${http_code}|${latency_ms}|${excerpt}")
done <<<"$CANDIDATES_TSV"

# Step 3 — emit the table.
printf '%s\n' "${ROWS[@]}" | column -t -s '|'

# Step 4 — summary footer (informational, never returned via exit code).
printf '\n'
printf 'summary: %d online / %d offline / %d total (probe timeout %ss)\n' \
       "$online_count" "$offline_count" "$total_count" "$PROBE_TIMEOUT_SECONDS"

exit 0

#!/usr/bin/env bash
# verify-session.sh — session health checks (R13 clock-in/out + R17 inbox)
#
# Usage:
#   verify-session.sh --role engineer --clock-in    # clock in
#   verify-session.sh --role architect --clock-out  # clock out
#   verify-session.sh --role planner --inbox        # check inbox
#   verify-session.sh --role reviewer --all         # clock in + inbox + clock out
#
# Options:
#   --role, -r       Role name (required)
#   --model          Model ID (default: $NEXUS_AGENT_MODEL or "opencode/big-pickle")
#   --clock-in        Clock in via timeclock MCP (POST /clock-in)
#   --clock-out       Clock out via timeclock MCP (POST /clock-out)
#   --inbox           Check inbox (uses check-inbox.sh)
#   --all             Clock in, check inbox, clock out
#   --timeclock-url   Timeclock URL (default: http://localhost:3600)
#   -h, --help        Show this help
#
# Exit codes: 0 ok, 1 API error, 2 usage error

set -euo pipefail

ROLE=""
MODEL="${NEXUS_AGENT_MODEL:-opencode/big-pickle}"
TIMECLOCK_URL="http://localhost:3600"
DO_CLOCK_IN=false
DO_CLOCK_OUT=false
DO_INBOX=false
FAILURES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --role|-r)     ROLE="$2"; shift 2 ;;
    --model)       MODEL="$2"; shift 2 ;;
    --clock-in)    DO_CLOCK_IN=true; shift ;;
    --clock-out)   DO_CLOCK_OUT=true; shift ;;
    --inbox)       DO_INBOX=true; shift ;;
    --all)         DO_CLOCK_IN=true; DO_INBOX=true; DO_CLOCK_OUT=true; shift ;;
    --timeclock-url) TIMECLOCK_URL="$2"; shift 2 ;;
    -h|--help)
      sed -n '4,19p' "$0"
      exit 0
      ;;
    *) echo "ERROR: unknown option: $1"; exit 2 ;;
  esac
done

[[ -n "$ROLE" ]] || { echo "ERROR: --role is required" >&2; exit 2; }

# ── clock in ──────────────────────────────────────────────────────
if $DO_CLOCK_IN; then
  echo "=== Clock In: $ROLE ==="
  RESP=$(curl -s -X POST "${TIMECLOCK_URL}/clock-in" \
    -H 'Content-Type: application/json' \
    -d "{\"role\":\"${ROLE}\",\"model\":\"${MODEL}\"}")
  echo "$RESP"
  echo "$RESP" | grep -q '"status":"ok"' || { echo "FAIL: clock-in"; FAILURES=$((FAILURES+1)); }
fi

# ── inbox ─────────────────────────────────────────────────────────
if $DO_INBOX; then
  echo "=== Inbox: $ROLE ==="
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  if [[ -x "${SCRIPT_DIR}/check-inbox.sh" ]]; then
    bash "${SCRIPT_DIR}/check-inbox.sh" --role "$ROLE" || FAILURES=$((FAILURES+1))
  else
    echo "WARN: check-inbox.sh not found — skipping inbox check"
  fi
fi

# ── clock out ─────────────────────────────────────────────────────
if $DO_CLOCK_OUT; then
  echo "=== Clock Out: $ROLE ==="
  RESP=$(curl -s -X POST "${TIMECLOCK_URL}/clock-out" \
    -H 'Content-Type: application/json' \
    -d "{\"role\":\"${ROLE}\",\"model\":\"${MODEL}\"}")
  echo "$RESP"
  echo "$RESP" | grep -q '"status":"ok"' || { echo "FAIL: clock-out"; FAILURES=$((FAILURES+1)); }
fi

echo "Total failures: $FAILURES"
exit $FAILURES

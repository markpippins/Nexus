#!/usr/bin/env bash
# bin/sysadmin-harness.sh — Sysadmin agent invocation harness
# ==========================================================
#
# Invokes the Sysadmin opencode agent for one maintenance cycle.
# Designed to be called by systemd (sysadmin-agent.service) on an
# hourly timer (sysadmin-agent.timer), or standalone.
#
# The harness:
#   1. Acquires a pidfile lock (prevents concurrent runs)
#   2. Sets up the environment (XDG_RUNTIME_DIR, etc.)
#   3. Calls `opencode run --agent sysadmin` with the cycle message
#   4. Logs timing, exit code, and any stderr to journald
#   5. Updates the incident log with the run outcome
#
# Usage
# -----
#     bin/sysadmin-harness.sh                       # one full cycle
#     bin/sysadmin-harness.sh --quick               # skip heavy checks, just ping + report
#     bin/sysadmin-harness.sh --outage "<service>"  # targeted run for a specific outage
#
# Exit codes
# ----------
#   0 — cycle completed normally
#   1 — lock contention (another run in progress)
#   2 — opencode not found
#   3 — cycle failed (opencode returned non-zero)

set -uo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="$(cd "$BIN_DIR/.." && pwd)"
STATE_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}/nexus-sysadmin"
LOCK_FILE="$STATE_DIR/sysadmin-harness.lock"
LOG_FILE="$STATE_DIR/sysadmin-harness.log"

# ── Config ──────────────────────────────────────────────────────────────

OPENCODE_BIN="${OPENCODE_BIN:-$(command -v opencode 2>/dev/null || echo "$HOME/.opencode/bin/opencode")}"
OPENCODE_PROJECT="${OPENCODE_PROJECT:-$NEXUS_ROOT}"
OPENCODE_AGENT="${OPENCODE_AGENT:-sysadmin}"
TIMEOUT_MINUTES="${TIMEOUT_MINUTES:-15}"  # max runtime per model attempt

# Model selection — primary tries NVIDIA-hosted GLM 5.2, falls back to opencode/big-pickle
# Override via SYSMODEL / FALLBACK_MODEL env vars.
SYSMODEL="${SYSMODEL:-opencode/big-pickle}"
FALLBACK_MODEL="${FALLBACK_MODEL:-nvidia/z-ai/glm-5.2}"

# ── Lock ────────────────────────────────────────────────────────────────

_acquire_lock() {
    mkdir -p "$STATE_DIR"
    if ! flock -n "$LOCK_FD" 2>/dev/null; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
        echo "[sysadmin-harness] $(date '+%Y-%m-%d %H:%M:%S') [LOCK] Another run is in progress (PID $pid) — deferring"
        exit 1
    fi
    echo "$$" > "$LOCK_FILE"
}

_release_lock() {
    exec {LOCK_FD}>&- 2>/dev/null || true
    rm -f "$LOCK_FILE" 2>/dev/null || true
}

# ── Helpers ─────────────────────────────────────────────────────────────

_log() {
    local level="$1"
    shift
    echo "[sysadmin-harness] $(date '+%Y-%m-%d %H:%M:%S') [$level] $*"
}

# Check if opencode binary exists and is executable.
_check_opencode() {
    if [[ ! -x "$OPENCODE_BIN" ]]; then
        _log "ERROR" "opencode not found at $OPENCODE_BIN"
        _log "ERROR" "Set OPENCODE_BIN or install opencode"
        exit 2
    fi
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    local mode="full"
    local outage_target=""

    # Parse flags
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --quick)    mode="quick"; shift ;;
            --outage)   mode="outage"; outage_target="$2"; shift 2 ;;
            --help|-h)  sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# //'; exit 0 ;;
            *)          _log "WARN" "Unknown option: $1"; shift ;;
        esac
    done

    _check_opencode

    # Acquire lock (fd 200)
    exec {LOCK_FD}>"$LOCK_FILE"
    _acquire_lock
    trap _release_lock EXIT

    _log "INFO" "Starting sysadmin cycle (mode=$mode)"

    local start_ts
    start_ts=$(date +%s)

    # Build the message for the sysadmin agent based on mode
    local cycle_msg
    case "$mode" in
        full)
            cycle_msg="Execute hourly maintenance cycle: discover issues via terrain, act on them (restart down services, kill zombies), then post action summary to Assembly syslog heartbeat."
            ;;
        quick)
            cycle_msg="Quick health check — ping critical services and report. Skip terrain topology deep dive, skip zombie sweep."
            ;;
        outage)
            cycle_msg="Targeted response to detected outage: $outage_target. Determine root cause and act within authority ladder."
            ;;
    esac

    # Run the sysadmin agent
    # We run with --format json to get machine-readable output, redirecting
    # stdin from /dev/null so the agent doesn't hang waiting for input.
    # Tries primary model first ($SYSMODEL), falls back to $FALLBACK_MODEL on failure.
    local exit_code=0
    local output
    local attempt=1
    local model="$SYSMODEL"

    _log "INFO" "Attempt $attempt: running with model $model (timeout=${TIMEOUT_MINUTES}m)"
    output=$(timeout "${TIMEOUT_MINUTES}m" "$OPENCODE_BIN" run \
        --agent "$OPENCODE_AGENT" \
        --model "$model" \
        --dir "$OPENCODE_PROJECT" \
        --format json \
        --dangerously-skip-permissions \
        "$cycle_msg" \
        </dev/null 2>&1) || exit_code=$?

    if [[ "$exit_code" -ne 0 && "$model" != "$FALLBACK_MODEL" ]]; then
        _log "WARN" "Primary model $model failed (exit=$exit_code) — trying fallback $FALLBACK_MODEL"
        attempt=2
        model="$FALLBACK_MODEL"
        exit_code=0
        _log "INFO" "Attempt $attempt: running with model $model (timeout=${TIMEOUT_MINUTES}m)"
        output=$(timeout "${TIMEOUT_MINUTES}m" "$OPENCODE_BIN" run \
            --agent "$OPENCODE_AGENT" \
            --model "$model" \
            --dir "$OPENCODE_PROJECT" \
            --format json \
            --dangerously-skip-permissions \
            "$cycle_msg" \
            </dev/null 2>&1) || exit_code=$?
    fi

    local end_ts
    end_ts=$(date +%s)
    local elapsed=$((end_ts - start_ts))

    _log "INFO" "Cycle completed in ${elapsed}s with exit code $exit_code"

    # Log the run outcome
    mkdir -p "$STATE_DIR"
    {
        echo "---"
        echo "cycle: $(date -Iseconds)"
        echo "mode: $mode"
        echo "exit_code: $exit_code"
        echo "elapsed_seconds: $elapsed"
        echo "---"
    } >> "$LOG_FILE"

    # Capture key output for the incident log
    if [[ "$exit_code" -ne 0 ]]; then
        _log "WARN" "opencode run returned non-zero exit code $exit_code"
        # Truncate output to last 50 lines for context
        echo "$output" | tail -50 >> "$LOG_FILE"
    fi

    # On outage mode, also append a brief to the incident log
    if [[ "$mode" == "outage" ]]; then
        echo "$output" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    summary = data.get('content', '')[:500] if isinstance(data, dict) else str(data)[:500]
    print(f'Outage response summary:\\n{summary}')
    print('\\n---')
except (json.JSONDecodeError, Exception):
    pass
" 2>/dev/null >> "$LOG_FILE" || true
    fi

    # Output a brief status line for journald
    echo "RESULT: mode=$mode exit=$exit_code elapsed=${elapsed}s"

    return $exit_code
}

main "$@"

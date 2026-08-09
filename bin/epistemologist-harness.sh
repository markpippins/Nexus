#!/usr/bin/env bash
# bin/epistemologist-harness.sh — Epistemologist (Concept Extractor) invocation wrapper
# =========================================================================
#
# Thin wrapper around the canonical Epistemologist Python implementation
# (nexus/python/epistemologist/ — plan 1281). Queries unprocessed
# source_observations and runs LLM-driven concept/relationship/evidence
# extraction into the semantics schema.
#
# The Epistemologist reads source_observations produced by the Auditor
# (asset kinds: plan, implementation_plan, session_log), extracts typed
# concepts mapped onto the seeded ontology (13 concepts / 31 relationship
# types), proposes new concepts only when no seed matches, and links every
# edge back via statement_evidence.
#
# Usage
# -----
#     bin/epistemologist-harness.sh                        # last 50 observations
#     bin/epistemologist-harness.sh --limit 10             # process 10
#     bin/epistemologist-harness.sh --dry-run --limit 5    # preview only
#     bin/epistemologist-harness.sh --verbose
#
# Exit codes
# ----------
#   0 — extraction completed normally
#   1 — lock contention
#   2 — python / epistemologist not importable
#   3 — cycle failed (all models exhausted)

set -uo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="$(cd "$BIN_DIR/.." && pwd)"
PYTHON_DIR="$NEXUS_ROOT/python"
STATE_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}/nexus-epistemologist"
LOCK_FILE="$STATE_DIR/epistemologist-harness.lock"
LOG_DIR="$NEXUS_ROOT/logs"
HARNESS_LOG="$LOG_DIR/epistemologist-harness.log"

# ── Config ──────────────────────────────────────────────────────────────

PYTHON_BIN="${PYTHON_BIN:-python3}"
ROLE="${ROLE:-epistemologist}"
LIMIT=""
DRY_RUN=false
VERBOSE=false

# ── Parse args ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --limit)  LIMIT="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --verbose|-v) VERBOSE=true; shift ;;
        --role)   ROLE="$2"; shift 2 ;;
        *) echo "Unknown flag: $1" >&2; exit 4 ;;
    esac
done

# ── Lock ────────────────────────────────────────────────────────────────

_acquire_lock() {
    mkdir -p "$STATE_DIR"
    exec {LOCK_FD}>"$LOCK_FILE"
    if ! flock -n "$LOCK_FD" 2>/dev/null; then
        echo "[epistemologist] $(date '+%Y-%m-%d %H:%M:%S') [LOCK] Already running — deferring"
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
    local level="$1"; shift
    local line="[epistemologist] $(date '+%Y-%m-%d %H:%M:%S') [$level] $*"
    echo "$line" >&2
    mkdir -p "$LOG_DIR" 2>/dev/null || true
    echo "$line" >> "$HARNESS_LOG" 2>/dev/null || true
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    # Check python + epistemologist import
    if ! "$PYTHON_BIN" -c "import sys; sys.path.insert(0, '$PYTHON_DIR'); import epistemologist" 2>/dev/null; then
        _log "ERROR" "epistemologist module not importable from $PYTHON_DIR"
        exit 2
    fi

    _acquire_lock
    trap _release_lock EXIT

    local args=()
    args+=(--role "$ROLE")
    if [[ -n "$LIMIT" ]]; then args+=(--limit "$LIMIT"); fi
    if [[ "$DRY_RUN" == true ]]; then args+=(--dry-run); fi
    if [[ "$VERBOSE" == true ]]; then args+=(-v); fi

    _log "INFO" "Starting Epistemologist (role=$ROLE limit=${LIMIT:-50} dry_run=$DRY_RUN)"

    local start_ts; start_ts=$(date +%s)

    # Run the canonical Python implementation
    (cd "$PYTHON_DIR" && "$PYTHON_BIN" -m epistemologist.main "${args[@]}" 2>&1)
    local exit_code=$?

    local end_ts elapsed
    end_ts=$(date +%s)
    elapsed=$((end_ts - start_ts))

    if [[ "$exit_code" -eq 0 ]]; then
        _log "INFO" "Epistemologist completed in ${elapsed}s"
    else
        _log "ERROR" "Epistemologist failed after ${elapsed}s (exit=$exit_code)"
    fi

    return $exit_code
}

main "$@"

#!/usr/bin/env bash
#
# compute-cpf.sh
#
# PURPOSE:
#   Compute Compilation-adjacent Readiness (CPF) scores for all harvest
#   candidates, then query the ready ones. This is the mechanism that
#   answers "what's pending to compile?" without manual inspection.
#
#   Stage 1 — cpf_compute.py
#     Reads every harvest candidate, scores it on six axes
#     (intent completeness, hierarchy mapping, tags, artifacts,
#     dependency resolution, reconciliation), and writes the CPF
#     score back to the database.
#
#   Stage 2 — cpf_query.py
#     Queries candidates with CPF >= threshold and outputs them
#     as human-readable or JSON for UI consumption.
#
# PREREQUISITES:
#   - Docker container `pgvector_db` running with the nexus database
#   - Python venv at nexus/python/rover/.venv
#
# USAGE:
#   cd ~/dev/nexus
#   ./scripts/bash/compute-cpf.sh                     # compute + query (threshold 0.7)
#   ./scripts/bash/compute-cpf.sh --threshold 0.5     # custom threshold
#   ./scripts/bash/compute-cpf.sh --dry-run            # preview only
#   ./scripts/bash/compute-cpf.sh --json               # JSON output for DeepSeek UI
#   ./scripts/bash/compute-cpf.sh --count              # just the count of ready
#   ./scripts/bash/compute-cpf.sh --candidate <uuid>   # single candidate
#
# CRON (recompute every 15 minutes):
#   */15 * * * * /home/codex/dev/nexus/scripts/bash/compute-cpf.sh >/dev/null 2>&1
#
# AUTHOR:  generated via Codebuff
# DATE:    2026-07-03
#

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────

APPLY_MODE="true"           # "true" writes CPF to DB; "false" dry-runs
THRESHOLD=0.7
CANDIDATE_ID=""
OUTPUT_MODE=""              # "--json" or "--count" or ""

# ── Paths ───────────────────────────────────────────────────────────────

ROVER_DIR="/home/codex/dev/nexus/python/rover"
VENV_ACTIVATE="${ROVER_DIR}/.venv/bin/activate"
CPF_COMPUTE="${ROVER_DIR}/cpf_compute.py"
CPF_QUERY="${ROVER_DIR}/cpf_query.py"

# ── Parse CLI flags ─────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            APPLY_MODE="false"
            shift
            ;;
        --threshold)
            THRESHOLD="$2"
            shift 2
            ;;
        --candidate)
            CANDIDATE_ID="$2"
            shift 2
            ;;
        --json)
            OUTPUT_MODE="--json"
            shift
            ;;
        --count)
            OUTPUT_MODE="--count"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--threshold N] [--json|--count] [--candidate <uuid>]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ── Helpers ─────────────────────────────────────────────────────────────

log_info()  { echo "[INFO]  $*"; }
log_warn()  { echo "[WARN]  $*" >&2; }
log_error() { echo "[ERROR] $*" >&2; }
separator() { echo "========================================"; }

check_prereqs() {
    if ! docker ps --format '{{.Names}}' | grep -qx "pgvector_db"; then
        log_error "Docker container 'pgvector_db' is not running."
        exit 1
    fi
    log_info "  ✓ pgvector_db container is running"

    if [[ ! -f "$VENV_ACTIVATE" ]]; then
        log_error "Python venv not found at ${VENV_ACTIVATE}"
        exit 1
    fi

    if [[ ! -f "$CPF_COMPUTE" ]]; then
        log_error "Missing: ${CPF_COMPUTE}"
        exit 1
    fi
    if [[ ! -f "$CPF_QUERY" ]]; then
        log_error "Missing: ${CPF_QUERY}"
        exit 1
    fi
    log_info "  ✓ All scripts found"
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    separator
    log_info "CPF Readiness Pipeline"
    log_info "Threshold: ${THRESHOLD} | Apply: ${APPLY_MODE}"
    log_info "Time: $(date -Iseconds)"
    separator
    echo ""

    check_prereqs
    source "$VENV_ACTIVATE"
    log_info "Activated venv"
    echo ""

    # ── Stage 1: Compute ───────────────────────────────────────────────
    separator
    log_info "STAGE 1/2: Computing CPF scores"
    separator

    COMPUTE_ARGS=()
    if [[ "$APPLY_MODE" != "true" ]]; then
        COMPUTE_ARGS+=("--dry-run")
    fi
    if [[ -n "$CANDIDATE_ID" ]]; then
        COMPUTE_ARGS+=("--candidate" "$CANDIDATE_ID")
    fi

    python3 "$CPF_COMPUTE" "${COMPUTE_ARGS[@]}" 2>&1
    local compute_exit=$?
    echo ""

    if [[ "$compute_exit" -ne 0 ]]; then
        log_warn "CPF compute exited with code ${compute_exit}"
    fi

    # ── Stage 2: Query ─────────────────────────────────────────────────
    separator
    log_info "STAGE 2/2: Query ready candidates"
    separator

    QUERY_ARGS=()
    QUERY_ARGS+=("--threshold" "${THRESHOLD}")
    if [[ -n "$OUTPUT_MODE" ]]; then
        QUERY_ARGS+=("$OUTPUT_MODE")
    fi
    if [[ -n "$CANDIDATE_ID" ]]; then
        QUERY_ARGS+=("--candidate" "$CANDIDATE_ID")
    fi

    python3 "$CPF_QUERY" "${QUERY_ARGS[@]}" 2>&1
    local query_exit=$?
    echo ""

    # ── Summary ────────────────────────────────────────────────────────
    separator
    log_info "PIPELINE COMPLETE"
    log_info "End: $(date -Iseconds)"

    if [[ "$APPLY_MODE" != "true" ]]; then
        log_warn "Dry run — no CPF scores were written to the database."
    fi

    if [[ "$compute_exit" -ne 0 || "$query_exit" -ne 0 ]]; then
        log_warn "Non-zero exit: compute=${compute_exit} query=${query_exit}"
    fi
    separator
    exit $(( compute_exit | query_exit ))
}

main "$@"

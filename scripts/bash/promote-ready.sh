#!/usr/bin/env bash
#
# promote-ready.sh
#
# PURPOSE:
#   Promote ready harvest candidates into the pipeline.
#   Runs CPF computation first, then promotes candidates that meet the
#   readiness threshold by creating intent_records.
#
#   This closes the loop:
#     Harvest → Candidate → CPF readiness → IntentRecord → Requirements → Specs → ImplementationPlan → WorkRequest
#
#   NOTE (2026-07-03): This script no longer creates conduit plans directly.
#   candidate_promote.py now creates intent_records (lightweight pre-canonical
#   intents). The old flow (candidate → conduit plan) caused 10 stuck-pending
#   plans every 30 minutes — fixed structurally.
#
# PREREQUISITES:
#   - Docker container `pgvector_db` running with the nexus database
#   - Conduit-mcp NOT required (no longer creates conduit plans)
#   - Python venv at nexus/python/rover/.venv
#   - cpf_compute.py and candidate_promote.py in ROVER_DIR
#
# USAGE:
#   cd ~/dev/nexus
#   ./scripts/bash/promote-ready.sh                     # compute CPF + promote (limit 5)
#   ./scripts/bash/promote-ready.sh --limit 10           # promote up to 10 candidates
#   ./scripts/bash/promote-ready.sh --threshold 0.8      # higher bar for promotion
#   ./scripts/bash/promote-ready.sh --dry-run            # preview only
#   ./scripts/bash/promote-ready.sh --candidate <uuid>   # promote a specific candidate
#
# CRON (every 30 minutes, promote up to 3):
#   */30 * * * * /home/codex/dev/nexus/scripts/bash/promote-ready.sh --limit 3
#
# AUTHOR:  generated via Codebuff
# DATE:    2026-07-03
#

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────

APPLY_MODE="true"           # "true" promotes; "false" dry-runs
THRESHOLD=0.7
LIMIT=5
CANDIDATE_ID=""
SPECIFIC_IDS=()

# ── Paths ───────────────────────────────────────────────────────────────

ROVER_DIR="/home/codex/dev/nexus/python/rover"
BIN_DIR="/home/codex/dev/nexus/bin"
TACKLE_DIR="/home/codex/dev/nexus/python/tackle"
VENV_ACTIVATE="${ROVER_DIR}/.venv/bin/activate"
CPF_COMPUTE="${BIN_DIR}/cpf_compute.py"
CPF_QUERY="${BIN_DIR}/cpf_query.py"
PROMOTE="${TACKLE_DIR}/candidate_promote.py"

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
        --limit)
            LIMIT="$2"
            shift 2
            ;;
        --candidate)
            CANDIDATE_ID="$2"
            shift 2
            ;;
        --ids)
            shift
            while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do
                SPECIFIC_IDS+=("$1")
                shift
            done
            ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--threshold N] [--limit N] [--candidate <uuid>] [--ids <uuid>...]"
            echo ""
            echo "  Default: compute CPF + promote up to ${LIMIT} ready candidates"
            echo "  --dry-run:     preview only, no writes"
            echo "  --threshold N: CPF threshold (default: ${THRESHOLD})"
            echo "  --limit N:     max candidates to promote (default: ${LIMIT})"
            echo "  --candidate:   promote a specific candidate UUID"
            echo "  --ids:         promote multiple specific UUIDs"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage."
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

    if curl -sf http://localhost:3100/tools/call >/dev/null 2>&1; then
        log_info "  ✓ Conduit-mcp is reachable (not required for intent_record flow)"
    else
        log_info "  Conduit-mcp not reachable (ok — no longer needed for promotion step)"
    fi

    if [[ ! -f "$VENV_ACTIVATE" ]]; then
        log_error "Python venv not found at ${VENV_ACTIVATE}"
        exit 1
    fi

    for script in "$CPF_COMPUTE" "$PROMOTE"; do
        if [[ ! -f "$script" ]]; then
            log_error "Missing: ${script}"
            exit 1
        fi
    done
    log_info "  ✓ All scripts found"
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    separator
    log_info "Candidate Promotion Pipeline"
    log_info "Threshold: ${THRESHOLD} | Limit: ${LIMIT} | Apply: ${APPLY_MODE}"
    log_info "Time: $(date -Iseconds)"
    separator
    echo ""

    check_prereqs
    source "$VENV_ACTIVATE"
    log_info "Activated venv"
    echo ""

    # ── Step 1: Compute CPF ───────────────────────────────────────────
    if [[ -z "$CANDIDATE_ID" && ${#SPECIFIC_IDS[@]} -eq 0 ]]; then
        separator
        log_info "STEP 1/2: Computing CPF scores"
        separator

        COMPUTE_ARGS=()
        if [[ "$APPLY_MODE" != "true" ]]; then
            COMPUTE_ARGS+=("--dry-run")
        fi

        python3 "$CPF_COMPUTE" "${COMPUTE_ARGS[@]}" 2>&1
        local compute_exit=$?
        echo ""
    else
        log_info "STEP 1/2: Skipping CPF compute (using specific candidate IDs)"
    fi

    # ── Step 2: Promote ────────────────────────────────────────────────
    separator
    if [[ "$APPLY_MODE" != "true" ]]; then
        log_info "STEP 2/2: Promoting candidates (DRY RUN)"
    else
        log_info "STEP 2/2: Promoting candidates"
    fi
    separator

    PROMOTE_ARGS=()
    if [[ "$APPLY_MODE" != "true" ]]; then
        PROMOTE_ARGS+=("--dry-run")
    fi

    if [[ -n "$CANDIDATE_ID" ]]; then
        PROMOTE_ARGS+=("--candidate" "$CANDIDATE_ID")
    elif [[ ${#SPECIFIC_IDS[@]} -gt 0 ]]; then
        PROMOTE_ARGS+=("--candidates" "${SPECIFIC_IDS[@]}")
    else
        PROMOTE_ARGS+=("--ready" "--threshold" "${THRESHOLD}" "--limit" "${LIMIT}")
    fi

    python3 "$PROMOTE" "${PROMOTE_ARGS[@]}" 2>&1
    local promote_exit=$?
    echo ""

    # ── Summary ────────────────────────────────────────────────────────
    separator
    log_info "PIPELINE COMPLETE"
    log_info "End: $(date -Iseconds)"

    if [[ "$APPLY_MODE" != "true" ]]; then
        log_warn "DRY RUN — no data was written."
        log_info "Run without --dry-run to promote for real."
    fi

    exit $promote_exit
}

main "$@"

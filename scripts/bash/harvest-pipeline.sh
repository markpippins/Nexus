#!/usr/bin/env bash
#
# harvest-pipeline.sh
#
# PURPOSE:
#   Runs the full harvest ingestion pipeline for HTML chat transcripts
#   sitting in ~/dev/chats/. Two stages:
#
#   Stage 1 — batch_harvest_to_db.py
#     Runs Dockling (deterministic parser) on unprocessed HTML files,
#     inserts structured docklang into nebula.harvests via the Nebula API.
#
#   Stage 2 — batch_file_candidates.py
#     Reads docklang from unprocessed harvests, sends them through Gemini
#     to extract architectural candidates, and creates harvest_candidates
#     entries in the database.
#
# PREREQUISITES:
#   - Docker container `pgvector_db` running with the nexus database
#   - Nebula REST API reachable at localhost:3101
#   - Gemini API key configured in batch_file_candidates.py (AIzaSy...)
#   - Python venv at nexus/python/rover/.venv
#
# USAGE:
#   cd ~/dev/nexus
#   ./scripts/bash/harvest-pipeline.sh                   # default: limit=5 each
#   ./scripts/bash/harvest-pipeline.sh --limit 10        # process up to 10 each
#   ./scripts/bash/harvest-pipeline.sh --dry-run         # preview only
#   ./scripts/bash/harvest-pipeline.sh --files "AI as Junior Ontologists"  # specific files (Stage 1 only)
#
# SAFETY:
#   Dry-run by default. Pass --apply to actually write to the database.
#
# CRON EXAMPLE (process up to 6 once per hour):
#   0 * * * * /home/codex/dev/nexus/scripts/bash/harvest-pipeline.sh --apply --limit 6
#
# AUTHOR:  generated via Codebuff
# DATE:    2026-07-03
#

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────

APPLY_MODE="false"         # "true" to actually insert; "false" for dry-run
STAGE1_LIMIT=5              # max HTML files to process per run
STAGE2_LIMIT=5              # max unfiled harvests to process per run
STAGE2_BATCH=3              # harvests per Gemini call
SPECIFIC_FILES=()           # optional: specific filenames for Stage 1

# ── Paths ───────────────────────────────────────────────────────────────

ROVER_DIR="/home/codex/dev/nexus/python/rover"
BIN_DIR="/home/codex/dev/nexus/bin"
LOG_DIR="/home/codex/dev/nexus/logs"
VENV_ACTIVATE="${ROVER_DIR}/.venv/bin/activate"
STAGE1="${BIN_DIR}/batch_harvest_to_db.py"
STAGE2="${BIN_DIR}/batch_file_candidates.py"

# ── Log files (rotated: timestamped per run) ────────────────────────────
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
STAGE1_LOG="${LOG_DIR}/harvest-pipeline-stage1-${TIMESTAMP}.log"
STAGE2_LOG="${LOG_DIR}/harvest-pipeline-stage2-${TIMESTAMP}.log"
PIPELINE_LOG="${LOG_DIR}/harvest-pipeline-${TIMESTAMP}.log"

# Ensure log directory exists (idempotent — mkdir -p is safe if it already exists or is missing)
mkdir -p "$LOG_DIR"

# ── Parse CLI flags ─────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --apply)
            APPLY_MODE="true"
            shift
            ;;
        --dry-run)
            APPLY_MODE="false"
            shift
            ;;
        --limit)
            STAGE1_LIMIT="$2"
            STAGE2_LIMIT="$2"
            shift 2
            ;;
        --stage1-limit)
            STAGE1_LIMIT="$2"
            shift 2
            ;;
        --stage2-limit)
            STAGE2_LIMIT="$2"
            shift 2
            ;;
        --batch)
            STAGE2_BATCH="$2"
            shift 2
            ;;
        --files)
            # Everything after --files is a file argument
            shift
            while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do
                SPECIFIC_FILES+=("$1")
                shift
            done
            ;;
        -h|--help)
            echo "Usage: $0 [--apply] [--dry-run] [--limit N] [--stage1-limit N]"
            echo "          [--stage2-limit N] [--batch N] [--files name...]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--apply] [--dry-run] [--limit N] [--batch N] [--files name...]"
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
    log_info "Checking prerequisites..."

    if ! docker ps --format '{{.Names}}' | grep -qx "pgvector_db"; then
        log_error "Docker container 'pgvector_db' is not running."
        log_error "Start it with: docker start pgvector_db"
        exit 1
    fi
    log_info "  ✓ pgvector_db container is running"

    # Quick check Nebula API (used by Stage 2 and for harvest insert)
    if ! curl -sf http://localhost:3101/api/systems >/dev/null 2>&1; then
        log_warn "  Nebula API at localhost:3101 is not reachable."
        log_warn "  Stage 2 (candidate extraction) will fail."
        log_warn "  Ensure nebula-srv is running if you need candidates."
    else
        log_info "  ✓ Nebula API is reachable"
    fi

    if [[ "$APPLY_MODE" == "true" ]] && ! curl -sf http://localhost:3107/health >/dev/null 2>&1; then
        log_warn "  Assembly SRV at localhost:3107 is not reachable."
        log_warn "  Forum publishing (--publish) may fail."
        log_warn "  Ensure assembly-srv is running (port 3107, ASSEMBLY_SRV_PORT env)"
    elif curl -sf http://localhost:3107/health >/dev/null 2>&1; then
        log_info "  ✓ Assembly SRV is reachable"
    fi

    if [[ ! -f "$VENV_ACTIVATE" ]]; then
        log_error "Python venv not found at ${VENV_ACTIVATE}"
        exit 1
    fi
    log_info "  ✓ Python venv exists"

    if [[ ! -f "$STAGE1" ]]; then
        log_error "Stage 1 script not found: ${STAGE1}"
        exit 1
    fi
    log_info "  ✓ Stage 1 script found"

    if [[ ! -f "$STAGE2" ]]; then
        log_error "Stage 2 script not found: ${STAGE2}"
        exit 1
    fi
    log_info "  ✓ Stage 2 script found"
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    # Redirect all output (stdout+stderr) to both terminal and the pipeline log.
    # Python subprocess output is already tee'd to per-stage logs.
    exec > >(tee "$PIPELINE_LOG") 2>&1

    separator
    log_info "Harvest Pipeline — Stage 1 + Stage 2"
    log_info "APPLY_MODE = ${APPLY_MODE}"
    log_info "START_TIME = $(date -Iseconds)"
    separator
    echo ""

    check_prereqs
    echo ""

    # Activate Python venv
    source "$VENV_ACTIVATE"
    log_info "Activated venv: ${ROVER_DIR}/.venv"
    echo ""

    # ── Stage 1: Dockling → DB ─────────────────────────────────────────
    separator
    log_info "STAGE 1/2: Dockling → nebula.harvests"
    separator

    STAGE1_ARGS=()
    if [[ "$APPLY_MODE" != "true" ]]; then
        STAGE1_ARGS+=("--dry-run")
    fi

    if [[ ${#SPECIFIC_FILES[@]} -gt 0 ]]; then
        # Process specific files
        log_info "Processing ${#SPECIFIC_FILES[@]} specific file(s):"
        for f in "${SPECIFIC_FILES[@]}"; do
            log_info "  • $f"
        done
        python3 "$STAGE1" "${STAGE1_ARGS[@]}" "${SPECIFIC_FILES[@]}" 2>&1 | tee "$STAGE1_LOG"
    else
        # Discover and process unharvested by recency
        log_info "Discovering unharvested HTML files (limit: ${STAGE1_LIMIT}) ..."
        python3 "$STAGE1" "${STAGE1_ARGS[@]}" --limit "${STAGE1_LIMIT}" 2>&1 | tee "$STAGE1_LOG"
    fi

    local stage1_exit=$?
    echo ""

    if [[ "$stage1_exit" -ne 0 ]]; then
        log_warn "Stage 1 exited with code ${stage1_exit}"
    fi

    # ── Stage 2: Gemini → Candidates ──────────────────────────────────
    separator
    log_info "STAGE 2/2: Gemini → harvest_candidates"
    log_info "  (Reads docklang from new harvests, extracts architectural candidates)"
    separator

    if [[ "$APPLY_MODE" != "true" ]]; then
        log_info "DRY RUN — Stage 2 will preview which harvests would be processed."
    fi

    STAGE2_ARGS=()
    if [[ "$APPLY_MODE" != "true" ]]; then
        STAGE2_ARGS+=("--dry-run")
    fi
    STAGE2_ARGS+=("--limit" "${STAGE2_LIMIT}")
    STAGE2_ARGS+=("--batch" "${STAGE2_BATCH}")
    if [[ "$APPLY_MODE" == "true" ]]; then
        STAGE2_ARGS+=("--publish")
        log_info "  Publishing harvests to Assembly forum (--publish)"
    fi

    python3 "$STAGE2" "${STAGE2_ARGS[@]}" 2>&1 | tee "$STAGE2_LOG"

    local stage2_exit=$?
    echo ""

    # ── Summary ────────────────────────────────────────────────────────
    separator
    log_info "PIPELINE COMPLETE"
    log_info "END_TIME = $(date -Iseconds)"
    echo ""

    if [[ ${#SPECIFIC_FILES[@]} -gt 0 ]]; then
        log_info "Files processed:"
        for f in "${SPECIFIC_FILES[@]}"; do
            log_info "  • $f"
        done
    else
        log_info "Stage 1 limit: ${STAGE1_LIMIT}"
        log_info "Stage 2 limit: ${STAGE2_LIMIT}  (batch: ${STAGE2_BATCH})"
    fi

    if [[ "$APPLY_MODE" != "true" ]]; then
        log_info ""
        log_warn "All runs were in DRY-RUN mode. No data was written."
        log_info "Re-run with --apply to write to the database."
        log_info "Example: $0 --apply --limit 3"
    fi

    if [[ "$stage1_exit" -ne 0 || "$stage2_exit" -ne 0 ]]; then
        log_warn "Some stages had non-zero exit codes (S1=${stage1_exit}, S2=${stage2_exit})"
    fi

    separator
    exit $(( stage1_exit | stage2_exit ))
}

main "$@"

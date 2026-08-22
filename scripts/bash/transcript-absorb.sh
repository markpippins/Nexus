#!/usr/bin/env bash
#
# transcript-absorb.sh — Timer-driven wrapper for transcript_absorb.py
#
# Processes up to ABSORB_LIMIT (default 20) transcript files per tick.
# Idempotent: content-hash skip for already-ingested files.
#
# Usage:
#   ./transcript-absorb.sh                 # default: limit=20
#   ./transcript-absorb.sh --limit 50      # process up to 50
#   ABSORB_LIMIT=10 ./transcript-absorb.sh
#

set -euo pipefail

LIMIT="${ABSORB_LIMIT:-20}"
WORKSPACE="/home/codex/dev"
BIN_DIR="${WORKSPACE}/nexus/bin"
LOG_DIR="${WORKSPACE}/nexus/logs"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="${LOG_DIR}/transcript-absorb-${TIMESTAMP}.log"

mkdir -p "$LOG_DIR"

echo "=== Transcript Absorb — $(date -Iseconds) ===" | tee "$LOG_FILE"
echo "Limit: $LIMIT" | tee -a "$LOG_FILE"

cd "$WORKSPACE"
python3 "${BIN_DIR}/transcript_absorb.py" --apply --limit "$LIMIT" 2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}
echo "=== Exit: $EXIT_CODE ===" | tee -a "$LOG_FILE"
exit $EXIT_CODE

#!/usr/bin/env bash
set -euo pipefail

# Stage 0 — Build Reference Index (read-only)
# Captures all reference-like strings across the repository.

ROOT="${1:-.}"
OUTPUT="${2:-ref_index.txt}"

echo "[scan] indexing reference-like strings in $ROOT..."

rg -n --no-ignore --hidden \
  "intent_source|\.pipeline/|PIPELINE_|normalize-intent|ExecutionState|DCO|ExecutorRegistry|skill_ref|work_request" \
  "$ROOT" \
  -g '!.git/**' \
  -g '!.agent/scripts/**' \
  -g '!ref_index.txt' \
  > "$OUTPUT" 2>/dev/null || true

echo "[scan] wrote $OUTPUT ($(wc -l < "$OUTPUT") lines)"

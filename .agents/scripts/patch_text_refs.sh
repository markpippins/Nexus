#!/usr/bin/env bash
set -euo pipefail

# Stage 3 — YAML / Markdown / text downgrade pass
# Non-AST-safe but deterministic: pattern-based text replacement.

ROOT="${1:-.}"
PATCHED=0

echo "[patch-text] scanning for phantom references in non-JSON files..."

# Find files with phantom pipeline references (skip JSON — handled by Stage 2)
FILES=$(rg -l --no-ignore --hidden "intent_source|\.pipeline/PIPELINE_INTENT" "$ROOT" \
  -g '!*.json' -g '!.git' -g '!.agents/scripts' -g '!ref_index.txt' 2>/dev/null || true)

for f in $FILES; do
  # Soften or annotate pipeline references
  if rg -q 'intent_source.*\.pipeline/PIPELINE_INTENT' "$f" 2>/dev/null; then
    # Annotate with CIR-1 note rather than removing (preserves context)
    sed -i 's|intent_source.*\.pipeline/PIPELINE_INTENT\.yaml.*|intent_source: <removed: CIR-1 — no pipeline exists>|g' "$f"
    sed -i 's|intent_source.*\.pipeline/PIPELINE_INTENT\.yaml|intent_source: <removed: CIR-1 — no pipeline exists>|g' "$f"
    PATCHED=$((PATCHED + 1))
    echo "[patch-text] $f — removed PIPELINE_INTENT reference"
  fi
done

if [ "$PATCHED" -eq 0 ]; then
  echo "[patch-text] No text-level CIR-1 violations found"
else
  echo "[patch-text] $PATCHED files patched"
fi

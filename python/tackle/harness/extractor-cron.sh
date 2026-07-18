#!/usr/bin/env bash
#
# extractor-cron.sh — batch-clean Gemini "brain" reconciliation transcripts.
#
# Each invocation:
#   1. Copies any HOLD file not yet present in IN into IN (staging).
#   2. Runs the extractor harness on a batch of 5 IN files.
#      - fluffy files  -> regex adverb strip
#      - clean files   -> copied verbatim
#      - already-cleaned outputs in OUT are skipped (idempotent)
#   3. Staging files are left in IN; the harness marks completion by
#      writing the -clean output to OUT, so re-runs naturally advance.
#
# Intended to run on a schedule (e.g. every 15 minutes). With 159 files
# and 5/batch, a full pass takes ~32 runs (~8 hours at 15-min cadence).
#
set -u

HARNESS_DIR="/home/codex/dev/nexus/python/tackle/harness"
HOLD="$HARNESS_DIR/HOLD"
IN="$HARNESS_DIR/IN"
OUT="$HARNESS_DIR/OUT"
BATCH=5
PYTHON="/home/codex/opt/anaconda3/bin/python3"
PYTHONPATH="/home/codex/dev/nexus/python"

# 1. Stage any HOLD file not already in IN.
mkdir -p "$IN" "$OUT"
for f in "$HOLD"/*; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"
    [ -e "$IN/$base" ] && continue
    cp "$f" "$IN/$base"
done

# 2. Run the extractor on a batch of 5 (run from tackle/ so `harness`
#    is importable as a package; SOURCE_DIR/TARGET_DIR live in extractor.py).
cd "$HARNESS_DIR/.." || exit 1
PYTHONPATH="$PYTHONPATH" "$PYTHON" -c \
    "from harness.extractor import ExtractorHarness; ExtractorHarness().run_cycle(batch_size=$BATCH)" \
    >> /tmp/extractor-cron.log 2>&1

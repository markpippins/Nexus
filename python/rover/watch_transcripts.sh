#!/usr/bin/env bash
set -euo pipefail

INBOX_DIR="$HOME/transcripts/inbox"
OUTBOX_DIR="$HOME/transcripts/agendas"
ARCHIVE_DIR="$HOME/transcripts/archive"
PYTHON_BIN="$HOME/rover/.venv/bin/python3"
PYTHON_SCRIPT="$HOME/rover/harvest_pipeline.py"
LOG_FILE="$HOME/transcripts/watcher.log"

mkdir -p "$INBOX_DIR" "$OUTBOX_DIR" "$ARCHIVE_DIR"

# Fail early if venv Python doesn't exist (setup.sh not run)
if [ ! -x "$PYTHON_BIN" ]; then
    echo "[$(date)] FATAL: venv Python not found at $PYTHON_BIN — run setup.sh first" >> "$LOG_FILE"
    echo "FATAL: venv Python not found at $PYTHON_BIN — run setup.sh first" >&2
    exit 1
fi

echo "[$(date)] Watcher script started. Scanning $INBOX_DIR..." >> "$LOG_FILE"

while true; do
    shopt -s nullglob
    html_files=("$INBOX_DIR"/*.html)

    if [ ${#html_files[@]} -gt 0 ]; then
        for transcript in "${html_files[@]}"; do
            filename=$(basename "$transcript")
            base_name="${filename%.html}"
            output_md="$OUTBOX_DIR/${base_name}_agenda.md"

            echo "[$(date)] Found new transcript: $filename. Starting harvest..." >> "$LOG_FILE"

            "$PYTHON_BIN" "$PYTHON_SCRIPT" --input "$transcript" --output "$output_md" >> "$LOG_FILE" 2>&1

            if [ $? -eq 0 ]; then
                echo "[$(date)] Successfully processed: $filename -> ${base_name}_agenda.md" >> "$LOG_FILE"
                mv "$transcript" "$ARCHIVE_DIR/"
            else
                echo "[$(date)] ERROR processing $filename. See log above." >> "$LOG_FILE"
                mv "$transcript" "$ARCHIVE_DIR/${filename}.failed"
            fi
        done
    fi

    sleep 30
done

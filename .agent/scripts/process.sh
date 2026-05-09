#!/usr/bin/env bash
set -euo pipefail

# process.sh (v1) deterministic single-worker dispatcher
# Directory model: queued, active, complete, failed

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <project_root>"
  exit 1
fi

PROJECT_ROOT=$(cd "$1" && pwd)
PIPELINE_DIR="$PROJECT_ROOT/.pipeline/WORK_REQUESTS"

DIR="${BASH_SOURCE[0]%/*}"
DIR=$(cd "$DIR" && pwd)

QUEUED="$PIPELINE_DIR/queued"
ACTIVE="$PIPELINE_DIR/active"
COMPLETE="$PIPELINE_DIR/complete"
FAILED="$PIPELINE_DIR/failed"

ensure_dirs() {
  mkdir -p "$QUEUED" "$ACTIVE" "$COMPLETE" "$FAILED"
}

oldest_file_in_dir() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    echo ""
    return 0
  fi
  local f
  f=$(find "$dir" -maxdepth 1 -type f -printf "%T@|%P\n" 2>/dev/null | sort -n | head -n1 | cut -d'|' -f2-)
  echo "$f" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

move_to_dir() {
  local src="$1"; local dst_dir="$2"
  if [ -z "$src" ]; then
    return 0
  fi
  mkdir -p "$dst_dir"
  mv -f "$src" "$dst_dir/"
}

has_files() {
  local dir="$1"
  shopt -s nullglob
  local files=("$dir"/*)
  if [ ${#files[@]} -eq 0 ]; then
    return 1
  fi
  for f in "${files[@]}"; do
    if [ -f "$f" ]; then
      return 0
    fi
  done
  return 1
}

ensure_dirs

# Global halt: if any files present in failed/, stop immediately
if has_files "$FAILED"; then
  echo "HALT: failed/ contains files" >&2
  exit 1
fi

# Recovery rule: if active contains files on startup, re-execute oldest first
if has_files "$ACTIVE"; then
  oldest_active=$(oldest_file_in_dir "$ACTIVE")
  if [ -n "$oldest_active" ]; then
    # Re-queue all other active files (deterministic single-workflow)
    for fpath in "$ACTIVE"/*; do
      [ -f "$fpath" ] || continue
      bn=$(basename "$fpath")
      if [ "$bn" != "$oldest_active" ]; then
        mv -f "$fpath" "$QUEUED/"
      fi
    done
    # Execute the oldest now
    REQUEST_PATH="$ACTIVE/$oldest_active"
    if [ -f "$REQUEST_PATH" ]; then
      python3 "$DIR/executor.py" "$REQUEST_PATH" || {
        mv -f "$REQUEST_PATH" "$FAILED/"
        exit 1
      }
      # On success, move to complete
      mv -f "$REQUEST_PATH" "$COMPLETE/"
    fi
  fi
  # After handling startup active, promote next from queued if available
  oldest_queued=$(oldest_file_in_dir "$QUEUED")
  if [ -n "$oldest_queued" ]; then
    mv -f "$QUEUED/$oldest_queued" "$ACTIVE/"
  fi
  exit 0
fi

# Step 3: If there's no active, promote one from queued
oldest_queued=$(oldest_file_in_dir "$QUEUED")
if [ -n "$oldest_queued" ]; then
  mv -f "$QUEUED/$oldest_queued" "$ACTIVE/"
  # Execute it deterministically
  REQUEST_PATH="$ACTIVE/$oldest_queued"
  python3 "$DIR/executor.py" "$REQUEST_PATH" || {
    mv -f "$REQUEST_PATH" "$FAILED/"
    exit 1
  }
  mv -f "$REQUEST_PATH" "$COMPLETE/"
fi

exit 0

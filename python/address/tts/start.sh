#!/usr/bin/env bash
# start.sh — Start the TTS server
#
# Usage:
#   ./start.sh                  # Start with defaults
#   TTS_PORT=8601 ./start.sh    # Custom port
#   NATS_URL=nats://... ./start.sh  # Use NATS instead of PostgreSQL polling

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Default configuration ───────────────────────────────────────────
export DATABASE_URL="${DATABASE_URL:-postgres://pguser:pgpass@localhost:5432/nexus}"
export NATS_URL="${NATS_URL:-nats://localhost:4222}"
export TTS_PORT="${TTS_PORT:-8600}"
export TTS_HEALTH_INTERVAL="${TTS_HEALTH_INTERVAL:-300.0}"

# ── Ensure dependencies ─────────────────────────────────────────────
if ! python3 -c "import psycopg2" 2>/dev/null; then
    echo "[tts] Installing psycopg2-binary..."
    pip3 install --break-system-packages psycopg2-binary
fi

if ! python3 -c "import nats" 2>/dev/null; then
    echo "[tts] Installing nats-py..."
    pip3 install --break-system-packages nats-py
fi

if ! python3 -c "from piper import PiperVoice" 2>/dev/null; then
    echo "[tts] Installing piper-tts..."
    pip3 install --break-system-packages piper-tts
fi

echo "[tts] Starting TTS Server on port ${TTS_PORT}..."
exec python3 "$SCRIPT_DIR/main.py"

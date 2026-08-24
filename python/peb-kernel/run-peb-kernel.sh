#!/usr/bin/env bash
# run-peb-kernel.sh — peb-kernel systemd wrapper (Python, port 8098)
#
# WHY: The systemd unit's ExecStart must point at a wrapper script, not a
# bare `python -m` invocation, so that environment setup, prerequisite
# checks, and dependency validation happen before the service binds.  This
# mirrors the JVM counterpart at nexus/jvm/spring/peb-kernel/run-peb-kernel.sh.
#
# The JVM wrapper exists to avoid serving stale .m2 jars.  The Python wrapper
# exists to:
#   1. Validate Python and required packages are available.
#   2. Set PYTHONPATH so `peb_kernel` is importable without pip install.
#   3. Fail clearly and early if dependencies are missing — never start a
#      half-functional service that silently accepts requests.
#
# Environment:
#   PEB_PORT          — listen port (default 8098, matches JVM)
#   PEB_HOST          — bind address (default 0.0.0.0)
#   PEB_STORE         — "postgres" (production) or "memory" (tests)
#   PEB_DATABASE_URL  — PostgreSQL DSN when PEB_STORE=postgres
#
# Rollback: to restore the JVM kernel, stop the Python unit and start the
# JVM unit — no database or config change is needed because both
# implementations write the same peb schema.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

# ── Defaults (mirror sysadmin-config.json + JVM application.yml) ───────
export PEB_PORT="${PEB_PORT:-8098}"
export PEB_HOST="${PEB_HOST:-0.0.0.0}"
export PEB_STORE="${PEB_STORE:-postgres}"
export PEB_DATABASE_URL="${PEB_DATABASE_URL:-postgresql://pguser:pgpass@localhost:5432/nexus}"

# ── Prerequisite checks ────────────────────────────────────────────────
# Resolve the Python interpreter: prefer the one that has the required
# packages installed. The anaconda environment at /home/codex/opt/anaconda3
# is the project's canonical Python; fall back to PATH lookup.
PYTHON_BIN="${PYTHON_BIN:-}"
if [ -z "$PYTHON_BIN" ]; then
    if [ -x /home/codex/opt/anaconda3/bin/python3 ]; then
        PYTHON_BIN=/home/codex/opt/anaconda3/bin/python3
    elif command -v python3 &>/dev/null; then
        PYTHON_BIN=python3
    else
        echo "ERROR: python3 is not installed" >&2
        exit 1
    fi
fi

PYTHON_VERSION=$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
REQUIRED_MAJOR=3
REQUIRED_MINOR=11
ACTUAL_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
ACTUAL_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
if [ "$ACTUAL_MAJOR" -lt "$REQUIRED_MAJOR" ] || \
   { [ "$ACTUAL_MAJOR" -eq "$REQUIRED_MAJOR" ] && [ "$ACTUAL_MINOR" -lt "$REQUIRED_MINOR" ]; }; then
    echo "ERROR: Python >= ${REQUIRED_MAJOR}.${REQUIRED_MINOR} required, found ${PYTHON_VERSION}" >&2
    exit 1
fi

# Verify required packages are importable before binding the port.
# fastapi, uvicorn, and psycopg2 are declared in pyproject.toml.
if ! "$PYTHON_BIN" -c "import fastapi, uvicorn, psycopg2" 2>/dev/null; then
    echo "ERROR: required packages (fastapi, uvicorn, psycopg2-binary) are not installed" >&2
    echo "  Install with: cd $SCRIPT_DIR && pip install -e ." >&2
    exit 1
fi

# ── Launch ──────────────────────────────────────────────────────────────
exec "$PYTHON_BIN" -m peb_kernel.main

#!/usr/bin/env bash
# sonar-scan.sh — Run SonarQube analysis from titanium against vanadium.
# Handles the file-system-server/root/ recursive workspace copy that
# confuses the TypeScript sensor by temporarily moving it outside the tree.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SONAR_HOST="${SONAR_HOST_URL:-http://vanadium:9000}"
SONAR_LOGIN="${SONAR_LOGIN:?SONAR_LOGIN must be set}"
FSS_ROOT="$PROJECT_DIR/typescript/file-system-server/root"
FSS_STASH="/tmp/.fss-root-stash-$$"
GATE_WAIT="${1:-false}"

# Stash file-system-server/root if it exists and is non-empty
if [ -d "$FSS_ROOT" ] && [ "$(ls -A "$FSS_ROOT" 2>/dev/null)" ]; then
    echo "Stashing file-system-server/root for scan..."
    mv "$FSS_ROOT" "$FSS_STASH"
    STASHED=true
else
    STASHED=false
fi

# Restore on exit (success or failure)
cleanup() {
    if [ "$STASHED" = true ] && [ -d "$FSS_STASH" ]; then
        echo "Restoring file-system-server/root..."
        mv "$FSS_STASH" "$FSS_ROOT"
    fi
}
trap cleanup EXIT

# Run the scan
cd "$PROJECT_DIR"
rm -rf .scannerwork
/home/codex/bin/sonar-scanner \
    -Dsonar.host.url="$SONAR_HOST" \
    -Dsonar.login="$SONAR_LOGIN" \
    -Dsonar.qualitygate.wait="$GATE_WAIT"

#!/usr/bin/env bash
# sonar-scan.sh — Run SonarQube analysis from titanium against vanadium.
#
# NOTE: the old file-system-server/root stash logic is GONE (2026-08-28).
# It renames a live service's data root into /tmp before scanning, which
# breaks file operations and health checks while the server is active, and
# which strands the data in volatile storage if the EXIT trap is bypassed
# (SIGKILL / reboot / power loss). It was only ever a workaround for the
# TypeScript sensor walking the recursive workspace copy inside
# file-system-server/root/. That problem is now solved declaratively in
# sonar-project.properties:
#   - sonar.exclusions covers **/file-system-server/**
#   - sonar.javascript.tsconfigPaths pins the exact tsconfig list, so the
#     sensor never discovers nested tsconfigs under root/.
# No live data may be moved during a scan.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SONAR_HOST="${SONAR_HOST_URL:-http://vanadium:9000}"
SONAR_LOGIN="${SONAR_LOGIN:?SONAR_LOGIN must be set}"
GATE_WAIT="${1:-false}"

# Run the scan
cd "$PROJECT_DIR"
rm -rf .scannerwork
/home/codex/bin/sonar-scanner \
    -Dsonar.host.url="$SONAR_HOST" \
    -Dsonar.login="$SONAR_LOGIN" \
    -Dsonar.qualitygate.wait="$GATE_WAIT"
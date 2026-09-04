#!/usr/bin/env bash
# CI TS test runner — plain services (build #22 follow-up).
# Executed inside node:20-bookworm with the workspace mounted at /ws.
set -uo pipefail
svc="$1"
cd "/ws/typescript/$svc" || exit 1
npm install --ignore-scripts --no-audit --no-fund --silent 2>/dev/null
npm test

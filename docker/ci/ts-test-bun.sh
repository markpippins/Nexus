#!/usr/bin/env bash
# CI TS test runner — file-system-server / secure-file-system-server
# (build #22 follow-up). Their run-tests.sh harness requires bun, which the
# node:20-bookworm image lacks; npm i -g bun installs a working binary.
set -uo pipefail
svc="$1"
cd "/ws/typescript/$svc" || exit 1
npm install --ignore-scripts --no-audit --no-fund --silent 2>/dev/null
if ! command -v bun >/dev/null 2>&1; then
  npm install -g --silent bun >/dev/null 2>&1 || { echo "bun install failed"; exit 1; }
fi
# The test harness targets 4040; file-system-server's committed .env.local
# pins its server to 4042 (shared-host collision avoidance). In CI each
# service runs in its own container, so pin the server onto the port the
# harness expects (dotenv does not override preset env vars).
export FS_SERVER_PORT=4040
# run-tests.sh points the server at /tmp/test-fs-root but never creates it;
# a missing root makes the health check report DOWN.
mkdir -p /tmp/test-fs-root
bash run-tests.sh

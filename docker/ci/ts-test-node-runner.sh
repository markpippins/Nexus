#!/usr/bin/env bash
# CI TS test runner — node --test glob services (peb-srv, shrapnel).
# build #22 follow-up: their "test/**/*.test.js" glob matched nothing under
# node --test's cwd rule; cd first, then run the resolved glob.
set -uo pipefail
svc="$1"
cd "/ws/typescript/$svc" || exit 1
npm install --ignore-scripts --no-audit --no-fund --silent 2>/dev/null
node --test test/

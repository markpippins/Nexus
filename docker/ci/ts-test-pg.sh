#!/usr/bin/env bash
# CI TS test runner — services that need a live PostgreSQL (build #22 follow-up).
# Executed inside node:20-bookworm on the ci-pg-net bridge; the throwaway test
# PG is reachable as host "ci-conduit-pg" with the hermetic bootstrap applied.
# Usage: ts-test-pg.sh <service>
set -uo pipefail
svc="$1"
cd "/ws/typescript/$svc" || exit 1
npm install --ignore-scripts --no-audit --no-fund --silent 2>/dev/null

# Per-service unique schema/database names avoid collisions and let the
# bootstrap stay pristine for the Python stage.
export CONDUIT_PG_DSN="postgresql://pguser:pgpass@ci-conduit-pg:5432/nexus"
case "$svc" in
  conduit-mcp)
    export CONDUIT_PG_SCHEMA="test_conduit_ts_$(date +%s)"
    npm test
    ;;
  *)
    npm test
    ;;
esac

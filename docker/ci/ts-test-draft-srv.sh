#!/usr/bin/env bash
# CI TS test runner — draft-srv (build #22 follow-up).
# Its integration test drives a LIVE server on :3170 (per its own header:
# "Usage: npm test (draft-srv must be running on :3170)"), so CI spawns the
# server, waits for readiness, then runs the test against it. Both the server
# and the test speak to the hermetic test PG on the bridge network.
set -uo pipefail
cd /ws/typescript/draft-srv || exit 1
npm install --ignore-scripts --no-audit --no-fund --silent 2>/dev/null

export PORT=3170
export NEXUS_INTERNAL_SECRET=ci-internal-secret
export PGHOST=ci-conduit-pg
export PGPORT=5432
export PGUSER=pguser
export PGPASSWORD=pgpass
export PGDATABASE=nexus

# Schema-discovery assertions expect the database's public schema to have
# tables with columns/PKs (true in prod, empty in the hermetic bootstrap by
# design). Seed one clearly-namespaced probe table for discovery to find.
# (node:20-bookworm has no psql; use the service's own pg dependency.)
node -e "
  const { Client } = require('pg');
  const c = new Client({ host: 'ci-conduit-pg', port: 5432, user: 'pguser', password: 'pgpass', database: 'nexus' });
  c.connect()
    .then(() => c.query('CREATE TABLE IF NOT EXISTS public.ci_discovery_probe (id serial PRIMARY KEY, label text NOT NULL)'))
    .then(() => c.end())
    .catch(e => { console.error('seed failed:', e.message); process.exit(1); });
"

npx tsx src/index.ts > /tmp/draft-srv.log 2>&1 &
SRV_PID=$!
trap 'kill $SRV_PID 2>/dev/null' EXIT

up=0
for i in $(seq 1 30); do
  if node -e "
    fetch('http://127.0.0.1:3170/api/db/engines', {
      headers: process.env.NEXUS_INTERNAL_SECRET
        ? { 'X-Nexus-Internal': process.env.NEXUS_INTERNAL_SECRET }
        : {},
    }).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))
  " 2>/dev/null; then
    up=1; break
  fi
  sleep 1
done
if [ "$up" -ne 1 ]; then
  echo "draft-srv failed to become ready:"; cat /tmp/draft-srv.log; exit 1
fi

npx tsx tests/draft-srv.integration.test.ts
rc=$?
echo "--- server log (tail) ---"; tail -5 /tmp/draft-srv.log
exit $rc

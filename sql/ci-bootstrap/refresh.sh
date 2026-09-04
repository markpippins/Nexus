#!/bin/bash
# Regenerate the CI bootstrap from a live (prod or replica) nexus database.
# Usage: refresh.sh [host] [port] [user] [db]   (defaults: localhost 5432 pguser nexus)
# Requires PGPASSWORD or .pgpass for auth.
set -euo pipefail
HOST=${1:-localhost}; PORT=${2:-5432}; USER=${3:-pguser}; DB=${4:-nexus}
OUT="$(dirname "$0")/nexus-ci-bootstrap.sql"

TABLES=(
  semantics.canonical_asset
  execution.requests execution.receipts execution.attempts execution.leases
  vision.receipts vision.tickets
  conduit.sessions conduit.circuit_breaker
  nebula.work_requests nebula.work_requests_history
  nebula.implementation_plans nebula.implementation_plans_history
  nebula.specifications_history
  nebula.plans nebula.plan_status nebula.receipts_unified
)
TABLE_ARGS=(); for t in "${TABLES[@]}"; do TABLE_ARGS+=(-t "$t"); done

PRELUDE='-- nexus CI bootstrap — global receipt/WR surfaces for DB-backed tests
-- Extracted from a live nexus DB via pg_dump --schema-only; regenerate with
-- refresh.sh when conduit adapter global reads/writes change.
CREATE SCHEMA IF NOT EXISTS execution;
CREATE SCHEMA IF NOT EXISTS vision;
CREATE SCHEMA IF NOT EXISTS nebula;
CREATE SCHEMA IF NOT EXISTS conduit;
CREATE SCHEMA IF NOT EXISTS semantics;
CREATE EXTENSION IF NOT EXISTS btree_gist;
'

FUNCS=$(PGPASSWORD="${PGPASSWORD:-}" psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -AtAc "
SELECT pg_get_functiondef(p.oid) || ';'
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_trigger t ON t.tgfoid = p.oid
WHERE n.nspname IN ('execution','vision','nebula','conduit')
  AND t.tgrelid::regclass::text IN (
    'execution.requests','execution.receipts','execution.attempts','execution.leases',
    'vision.receipts','vision.tickets',
    'nebula.implementation_plans','nebula.implementation_plans_history',
    'conduit.sessions','conduit.circuit_breaker')")

PGPASSWORD="${PGPASSWORD:-}" pg_dump -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" \
  --schema-only --no-owner --no-privileges "${TABLE_ARGS[@]}" > /tmp/ci-bootstrap-body.$$

printf '%s\n%s\n\n%s' "$PRELUDE" "$FUNCS" "$(cat /tmp/ci-bootstrap-body.$$)" > "$OUT"
rm -f /tmp/ci-bootstrap-body.$$
echo "wrote $OUT ($(wc -l < "$OUT") lines)"

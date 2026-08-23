-- V118 — pagination sort indexes + stable ORDER BY support for the other
-- paginated list endpoints (agent-records, plans, execution/receipts)
--
-- Audit outcome (2026-08-23, same family as the V117 harvests fix): none of
-- these endpoints has a NULLS-placement mismatch — all three ORDER BYs are
-- plain `DESC` (NULLS FIRST) and their sort columns are NOT NULL, so the
-- harvests `NULLS LAST` trap does not recur. What they DO share with the
-- pre-fix harvests state:
--   1. no index on the ORDER BY column (seq scan + top-N sort at any scale),
--   2. no `id` tiebreaker, so equal sort keys give unstable page boundaries
--      (agent_records: 8,248 rows with only 3,830 distinct created_at — 55%
--      ties; receipts: 1,828 rows / 1,654 distinct issued_at).
--
-- Each composite (sortcol DESC, id DESC) index matches the endpoint's ORDER BY
-- exactly (DESC = NULLS FIRST on both columns; the id tiebreaker is added to
-- the queries in the same change — see routes.ts) so the planner can serve the
-- page with an ordered index scan as the tables grow.
--
-- Idempotent; mirrors the manual-psql application convention of the recent
-- V114–V116 migrations (not tracked in nebula.schema_version).

BEGIN;

CREATE INDEX IF NOT EXISTS idx_agent_records_history_created_at_id
  ON nebula.agent_records_history (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_implementation_plans_history_updated_at_id
  ON nebula.implementation_plans_history (updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_execution_receipts_issued_at_id
  ON execution.receipts (issued_at DESC, id DESC);

COMMIT;

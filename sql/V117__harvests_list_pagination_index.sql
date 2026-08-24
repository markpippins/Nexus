-- V117 — /api/harvests list pagination: stable ORDER BY + matching index
--
-- Context: the harvests list endpoint (GET /api/harvests) paginates with
--   ORDER BY created_at DESC NULLS LAST, h.id DESC
-- (the id tiebreaker was added in the same change; see routes.ts). Before
-- this migration the ORDER BY was created_at alone and the table had NO
-- index on it, so the planner did a seq scan + top-N heapsort of the whole
-- harvests_history table. created_at also has near-zero cardinality (all
-- harvests are ingested in batches on the same day), which made page
-- boundaries arbitrary and unstable between fetches.
--
-- The composite index serves the pagination order directly and keeps the
-- scan bounded to the requested page as the table grows. harvests_history
-- is the bitemporal base table that the nebula.harvests view reads from.
--
-- NULLS placement matters (verified at scale on 2026-08-23): the query
-- orders by `created_at DESC NULLS LAST, id DESC`, so the index MUST
-- declare `created_at DESC NULLS LAST` — a plain `created_at DESC` (NULLS
-- FIRST by default) does NOT satisfy the pathkeys and the planner falls
-- back to a full scan + top-N sort even at 1M rows. With the matching
-- NULLS LAST the planner flips to an ordered Index Scan that stops at the
-- page (0.08ms pagination / 0.62ms full endpoint query at 1M rows vs
-- ~169ms before).
--
-- Idempotent; mirrors the manual-psql application convention of the recent
-- V114–V116 migrations (not tracked in nebula.schema_version).

BEGIN;

CREATE INDEX IF NOT EXISTS idx_harvests_history_created_at_id
  ON nebula.harvests_history (created_at DESC NULLS LAST, id DESC);

COMMIT;

-- Migration 045: T22 entity_key uniqueness — btree_gist exclusion constraint
-- (architect binding decision 2026-08-14, escalation 30da53ac)
--
-- Enforce entity_key uniqueness across the bitemporal work_requests_history
-- with a gist exclusion constraint: the SAME entity_key may not have
-- OVERLAPPING validity ranges. This is the native bitemporal uniqueness
-- mechanism:
--
--   * same entity_key + overlapping validity  -> INSERT rejected
--   * same entity_key + adjacent validity      -> allowed (correct SCD4
--     versioning: [v1.until) == [v2.from))
--   * NULL entity_key rows (identity-unknown)  -> unaffected (NULL = NULL
--     is not a conflict; no partial predicate needed)
--
-- The non-unique btree index idx_work_requests_history_entity_key (migration
-- 044) is KEPT for point lookups — the gist constraint has a different cost
-- profile; both coexist.
--
-- Emission boundary: T07 WRP emission must STILL dedup by entity_key
-- (idempotent emission). DB constraint = "can't happen"; emission dedup =
-- "never tried". Both required.
--
-- No retroactive backfill: historical rows keep entity_key = NULL.
-- Rollback: ALTER TABLE ... DROP CONSTRAINT uq_work_requests_entity_key_active;

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE nebula.work_requests_history
  ADD CONSTRAINT uq_work_requests_entity_key_active
  EXCLUDE USING gist (
    entity_key WITH =,
    tstzrange(valid_from, valid_until) WITH &&
  );

INSERT INTO nebula.schema_version (version, description)
VALUES (45, 'T22 entity_key uniqueness: btree_gist exclusion constraint on nebula.work_requests_history')
ON CONFLICT (version) DO NOTHING;

COMMIT;

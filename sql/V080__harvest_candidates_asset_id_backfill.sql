-- ═══════════════════════════════════════════════════════════════════════
--  V080 — T01 Phase A-2: asset_id on nebula.harvest_candidates + backfill
--                        + harvest → candidate owns edges
--
--  Decision ref: 898a203b (architect, 2026-08-09)
--  Handoff: T01 asset_id migration phases V079–V083
--
--  Adds asset_id uuid FK → semantics.canonical_asset(id) to
--  nebula.harvest_candidates_history, backfills canonical assets
--  (asset_kind = 'candidate'), recreates the view, then creates
--  'owns' edges in semantics.asset_relation: harvest → its candidates.
--
--  Prerequisite: V079 (harvest asset_ids must be populated first).
--  Idempotent; re-runnable.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Add nullable asset_id FK to the base history table
ALTER TABLE nebula.harvest_candidates_history
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

-- 2. Create canonical_assets for current candidate rows (deterministic, idempotent)
INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:nebula_harvest_candidates:' || id::text, 'candidate'
FROM nebula.harvest_candidates_history
WHERE recorded_until_dt = '9999-12-31 00:00:00+00'
  AND asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- 3. Set asset_id on current candidate rows
UPDATE nebula.harvest_candidates_history hch
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:nebula_harvest_candidates:' || hch.id::text
  AND ca.expired_at IS NULL
  AND hch.asset_id IS NULL
  AND hch.recorded_until_dt = '9999-12-31 00:00:00+00';

-- 4. Recreate view to include asset_id
DROP VIEW IF EXISTS nebula.harvest_candidates CASCADE;
CREATE VIEW nebula.harvest_candidates AS
SELECT
    id, harvest_id, title, intent_description, implementation_notes,
    code_snippets, open_questions, tags, status, system_id, subsystem_id,
    feature_id, valid_from, valid_until, created_at, updated_at,
    work_request_id, completed, compilation_readiness, type,
    design_rationale, provenance_block_indices, needs_new_node,
    proposed_parent, proposed_name, placement_reason,
    recorded_on_dt, recorded_until_dt, asset_id
FROM nebula.harvest_candidates_history
WHERE now() >= recorded_on_dt
  AND now() < recorded_until_dt
  AND now() >= valid_from
  AND now() < valid_until;

-- 5. Create owns edges: harvest → candidate
INSERT INTO semantics.asset_relation
    (from_asset_id, to_asset_id, relation_type, decided_by, effective_at)
SELECT
    h.asset_id,
    hc.asset_id,
    'owns',
    'engineer',
    now()
FROM nebula.harvests h
JOIN nebula.harvest_candidates hc ON hc.harvest_id = h.id
WHERE h.asset_id IS NOT NULL
  AND hc.asset_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM semantics.asset_relation ar
    WHERE ar.from_asset_id = h.asset_id
      AND ar.to_asset_id = hc.asset_id
      AND ar.relation_type = 'owns'
      AND ar.expired_at IS NULL
  );

-- 6. Verify
DO $$
DECLARE
    v_null_count  integer;
    v_total       integer;
    v_edge_count  integer;
BEGIN
    -- Check all current candidates have asset_id
    SELECT count(*), count(*) FILTER (WHERE asset_id IS NULL)
        INTO v_total, v_null_count
    FROM nebula.harvest_candidates;

    IF v_null_count > 0 THEN
        RAISE EXCEPTION 'V080 verify: % of % candidate rows still have NULL asset_id', v_null_count, v_total;
    END IF;

    -- Count owns edges created
    SELECT count(*) INTO v_edge_count
    FROM semantics.asset_relation
    WHERE relation_type = 'owns'
      AND decided_by = 'engineer'
      AND expired_at IS NULL;

    RAISE NOTICE '✅ V080 applied — asset_id on % candidate rows (0 NULL), % total owns edges.',
        v_total, v_edge_count;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
--  V084 — Cardinality: intent_record_id FK on harvest_candidates + requirements
--
--  Decision ref: 691a1ff4 (architect, 2026-08-09)
--  Thread: fcb74cad
--  Target: candidate → intent_record N:1, intent_record → requirement 1:N
--
--  1. Add intent_record_id FK on harvest_candidates_history (the N side)
--  2. Add intent_record_id FK on requirements_history
--  3. Backfill from intent_records.candidate_id (first-wins for 2 dual-mapped)
--  4. Backfill requirements via candidate → intent_record chain
--  5. Add indexes, recreate views
--
--  Prerequisite: V079-V083 (asset_id) — orthogonal, no conflict.
--  Idempotent; re-runnable.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Add intent_record_id FK columns
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE nebula.harvest_candidates_history
    ADD COLUMN IF NOT EXISTS intent_record_id uuid;

ALTER TABLE nebula.requirements_history
    ADD COLUMN IF NOT EXISTS intent_record_id uuid;

-- ═══════════════════════════════════════════════════════════════════════
--  2. Backfill harvest_candidates.intent_record_id
--     FROM intent_records.candidate_id.
--     first-wins: for 2 candidates with 2 intent_records each, pick the
--     oldest intent_record (by created_at). History is preserved in
--     intent_records_history — we do NOT destroy sibling rows.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE nebula.harvest_candidates_history hch
SET intent_record_id = sub.intent_record_id
FROM (
    SELECT DISTINCT ON (ir.candidate_id)
        ir.candidate_id,
        ir.id AS intent_record_id
    FROM nebula.intent_records ir
    WHERE ir.candidate_id IS NOT NULL
    ORDER BY ir.candidate_id, ir.created_at ASC NULLS LAST
) sub
WHERE hch.id = sub.candidate_id
  AND hch.recorded_until_dt = '9999-12-31 00:00:00+00'
  AND hch.intent_record_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  3. Backfill requirements.intent_record_id
--     Via candidate → intent_record chain.
--     Only 1 requirement has candidate_id today; 27 others stay NULL.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE nebula.requirements_history rh
SET intent_record_id = hch.intent_record_id
FROM nebula.harvest_candidates_history hch
WHERE rh.candidate_id = hch.id
  AND hch.intent_record_id IS NOT NULL
  AND hch.recorded_until_dt = '9999-12-31 00:00:00+00'
  AND rh.recorded_until_dt = '9999-12-31 23:59:59+00'
  AND rh.intent_record_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  4. Add indexes on new FK columns
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_harvest_candidates_intent_record
    ON nebula.harvest_candidates_history(intent_record_id);

CREATE INDEX IF NOT EXISTS idx_requirements_intent_record
    ON nebula.requirements_history(intent_record_id);

-- ═══════════════════════════════════════════════════════════════════════
--  5. Recreate views
-- ═══════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS nebula.harvest_candidates CASCADE;
CREATE VIEW nebula.harvest_candidates AS
SELECT
    id, harvest_id, title, intent_description, implementation_notes,
    code_snippets, open_questions, tags, status, system_id, subsystem_id,
    feature_id, valid_from, valid_until, created_at, updated_at,
    work_request_id, completed, compilation_readiness, type,
    design_rationale, provenance_block_indices, needs_new_node,
    proposed_parent, proposed_name, placement_reason,
    recorded_on_dt, recorded_until_dt, asset_id, intent_record_id
FROM nebula.harvest_candidates_history
WHERE now() >= recorded_on_dt
  AND now() < recorded_until_dt
  AND now() >= valid_from
  AND now() < valid_until;

DROP VIEW IF EXISTS nebula.requirements CASCADE;
CREATE VIEW nebula.requirements AS
SELECT
    id, system_id, subsystem_id, feature_id, title, description,
    status, priority, start_date, completion_date, created_at,
    recorded_on_dt, recorded_until_dt, valid_from, valid_until,
    parent_id, req_type, acceptance_criteria, candidate_id,
    conduit_plan_id, work_request_dco, asset_id, intent_record_id
FROM nebula.requirements_history
WHERE now() >= recorded_on_dt
  AND now() < recorded_until_dt
  AND now() >= valid_from
  AND now() < valid_until;

-- ═══════════════════════════════════════════════════════════════════════
--  6. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_cand_total    integer;
    v_cand_null     integer;
    v_cand_mapped   integer;
    v_req_total     integer;
    v_req_null      integer;
    v_dual_total    integer;
BEGIN
    -- Candidates: all mapped to intent_records should have intent_record_id
    SELECT count(*) INTO v_cand_mapped
    FROM nebula.intent_records WHERE candidate_id IS NOT NULL;

    SELECT count(*), count(*) FILTER (WHERE intent_record_id IS NULL)
        INTO v_cand_total, v_cand_null
    FROM nebula.harvest_candidates hc
    WHERE EXISTS (SELECT 1 FROM nebula.intent_records ir WHERE ir.candidate_id = hc.id);

    IF v_cand_null > 0 THEN
        RAISE EXCEPTION 'V084 verify: % of % mapped candidates still have NULL intent_record_id',
            v_cand_null, v_cand_total;
    END IF;

    -- Requirements: count total
    SELECT count(*), count(*) FILTER (WHERE intent_record_id IS NULL)
        INTO v_req_total, v_req_null
    FROM nebula.requirements;

    -- Verify no dual-mapped candidates were destroyed
    SELECT count(*) INTO v_dual_total
    FROM nebula.harvest_candidates hc
    WHERE hc.intent_record_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM nebula.intent_records ir WHERE ir.candidate_id = hc.id);

    RAISE NOTICE '✅ V084 applied — %/% candidates mapped, % reqs (NULL=% — 27 expected stay NULL), % dual-mapped preserved.',
        v_cand_total, v_cand_mapped, v_req_total, v_req_null, v_dual_total;
END $$;

COMMIT;

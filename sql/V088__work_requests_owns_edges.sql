-- ═══════════════════════════════════════════════════════════════════════
--  V088 — T01 owns-edge pass: implementation_plan → work_request
--
--  Decision ref: 0cfa7478 (architect, 2026-08-09)
--  Precedent:    V080 (document→candidate), V081 (requirement→plan)
--  Prerequisite: V079–V086 (asset_id on both tables).
--
--  NOTE: renumbered V087 → V088 by engineer (2026-08-09) to resolve a
--  version collision — V087 was already taken by
--  V087__statement_evidence_polymorphic_trigger.sql (T04 3B, committed).
--  Content unchanged; architect's decision ref + verify criteria intact.
--
--  Creates `owns` edges from implementation_plan assets to the
--  work_request assets they spawned (1,907 edges, 100 distinct plans).
--  vision.work_requests are deliberately NOT wired here — they have no
--  nexus_work_request_id/plan linkage; edges come later with WR
--  consolidation (thread 43d799c2).
--
--  Idempotent; re-runnable (unique active index dedupes).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Create owns edges: implementation_plan → work_request
--     join: nebula.work_requests.plan_id (text) = implementation_plans.plan_number (text)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO semantics.asset_relation
    (from_asset_id, to_asset_id, relation_type, decided_by, effective_at)
SELECT
    ip.asset_id,
    nwr.asset_id,
    'owns',
    'architect',
    now()
FROM nebula.work_requests nwr
JOIN nebula.implementation_plans ip ON ip.plan_number = nwr.plan_id
WHERE nwr.plan_id IS NOT NULL
  AND ip.asset_id IS NOT NULL
  AND nwr.asset_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM semantics.asset_relation ar
    WHERE ar.from_asset_id = ip.asset_id
      AND ar.to_asset_id = nwr.asset_id
      AND ar.relation_type = 'owns'
      AND ar.expired_at IS NULL
  );

-- ═══════════════════════════════════════════════════════════════════════
--  2. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_edges       integer;
    v_wr_total    integer;
    v_wr_unlinked integer;
BEGIN
    -- Count plan→WR owns edges
    SELECT count(*) INTO v_edges
    FROM semantics.asset_relation ar
    JOIN semantics.canonical_asset ca_from ON ca_from.id = ar.from_asset_id
    JOIN semantics.canonical_asset ca_to   ON ca_to.id   = ar.to_asset_id
    WHERE ar.relation_type = 'owns'
      AND ar.decided_by = 'architect'
      AND ar.expired_at IS NULL
      AND ca_from.asset_kind = 'implementation_plan'
      AND ca_to.asset_kind   = 'work_request';

    -- WRs still without an incoming owns edge (expected: 4 orphans)
    SELECT count(*) INTO v_wr_total
    FROM nebula.work_requests;

    SELECT count(*) INTO v_wr_unlinked
    FROM nebula.work_requests nwr
    LEFT JOIN semantics.asset_relation ar
           ON ar.to_asset_id = nwr.asset_id
          AND ar.relation_type = 'owns'
          AND ar.expired_at IS NULL
    WHERE ar.id IS NULL;

    RAISE NOTICE '✅ V088 applied — % plan→WR owns edges, % of % nebula WRs linked (% unlinked = 4 expected orphans).',
        v_edges, (v_wr_total - v_wr_unlinked), v_wr_total, v_wr_unlinked;
END $$;

COMMIT;

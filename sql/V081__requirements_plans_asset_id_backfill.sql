-- ═══════════════════════════════════════════════════════════════════════
--  V081 — T01 Phase B: asset_id on nebula.requirements
--                       + nebula.implementation_plans + backfill
--                       + requirement → plan owns edges
--
--  Decision ref: 898a203b (architect, 2026-08-09)
--  Handoff: T01 asset_id migration phases V079–V083
--
--  Prerequisite: V079–V080 (harvest/candidate asset_ids).
--  Idempotent; re-runnable.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Add asset_id FK columns
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE nebula.requirements_history
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

ALTER TABLE nebula.implementation_plans_history
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

-- ═══════════════════════════════════════════════════════════════════════
--  2. Create canonical_assets: requirements (asset_kind = requirement)
--     sentinel: 9999-12-31 23:59:59+00
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:nebula_requirements:' || id::text, 'requirement'
FROM nebula.requirements_history
WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
  AND asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  3. Create canonical_assets: implementation_plans (asset_kind = implementation_plan)
--     sentinel: 9999-12-31 00:00:00+00
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:nebula_implementation_plans:' || id::text, 'implementation_plan'
FROM nebula.implementation_plans_history
WHERE recorded_until_dt = '9999-12-31 00:00:00+00'
  AND asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  4. Set asset_id on current rows
-- ═══════════════════════════════════════════════════════════════════════

UPDATE nebula.requirements_history rh
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:nebula_requirements:' || rh.id::text
  AND ca.expired_at IS NULL
  AND rh.asset_id IS NULL
  AND rh.recorded_until_dt = '9999-12-31 23:59:59+00';

UPDATE nebula.implementation_plans_history iph
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:nebula_implementation_plans:' || iph.id::text
  AND ca.expired_at IS NULL
  AND iph.asset_id IS NULL
  AND iph.recorded_until_dt = '9999-12-31 00:00:00+00';

-- ═══════════════════════════════════════════════════════════════════════
--  5. Recreate views
-- ═══════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS nebula.requirements CASCADE;
CREATE VIEW nebula.requirements AS
SELECT
    id, system_id, subsystem_id, feature_id, title, description,
    status, priority, start_date, completion_date, created_at,
    recorded_on_dt, recorded_until_dt, valid_from, valid_until,
    parent_id, req_type, acceptance_criteria, candidate_id,
    conduit_plan_id, work_request_dco, asset_id
FROM nebula.requirements_history
WHERE now() >= recorded_on_dt
  AND now() < recorded_until_dt
  AND now() >= valid_from
  AND now() < valid_until;

DROP VIEW IF EXISTS nebula.implementation_plans CASCADE;
CREATE VIEW nebula.implementation_plans AS
SELECT
    id, plan_number, spec_id, requirement_id, title, goal, content,
    files_affected, acceptance_criteria, dependencies, status, tags,
    metadata, created_at, updated_at, valid_from, valid_until,
    recorded_on_dt, recorded_until_dt, asset_id
FROM nebula.implementation_plans_history
WHERE now() >= recorded_on_dt
  AND now() < recorded_until_dt
  AND now() >= valid_from
  AND now() < valid_until;

-- ═══════════════════════════════════════════════════════════════════════
--  6. Create owns edges: requirement → implementation_plan
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO semantics.asset_relation
    (from_asset_id, to_asset_id, relation_type, decided_by, effective_at)
SELECT
    r.asset_id,
    ip.asset_id,
    'owns',
    'engineer',
    now()
FROM nebula.requirements r
JOIN nebula.implementation_plans ip ON ip.requirement_id = r.id
WHERE r.asset_id IS NOT NULL
  AND ip.asset_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM semantics.asset_relation ar
    WHERE ar.from_asset_id = r.asset_id
      AND ar.to_asset_id = ip.asset_id
      AND ar.relation_type = 'owns'
      AND ar.expired_at IS NULL
  );

-- ═══════════════════════════════════════════════════════════════════════
--  7. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_req_total integer;
    v_req_null  integer;
    v_ip_total  integer;
    v_ip_null   integer;
    v_edge      integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE asset_id IS NULL)
        INTO v_req_total, v_req_null FROM nebula.requirements;
    SELECT count(*), count(*) FILTER (WHERE asset_id IS NULL)
        INTO v_ip_total, v_ip_null FROM nebula.implementation_plans;

    IF v_req_null > 0 THEN
        RAISE EXCEPTION 'V081 verify: % of % requirement rows still NULL', v_req_null, v_req_total;
    END IF;
    IF v_ip_null > 0 THEN
        RAISE EXCEPTION 'V081 verify: % of % implementation_plan rows still NULL', v_ip_null, v_ip_total;
    END IF;

    SELECT count(*) INTO v_edge FROM semantics.asset_relation
    WHERE relation_type = 'owns' AND decided_by = 'engineer' AND expired_at IS NULL;

    RAISE NOTICE '✅ V081 applied — % reqs, % plans (0 NULL), % total owns edges.',
        v_req_total, v_ip_total, v_edge;
END $$;

COMMIT;

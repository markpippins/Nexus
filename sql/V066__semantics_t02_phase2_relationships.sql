-- ═══════════════════════════════════════════════════════════════════════
--  V066 — semantics: T02 Phase 2 — asset relationship layer
--
--  Implements the relationship-layer half of the T02 canonical asset &
--  revision contract v1.0 (approved in Assembly to-do thread
--  84c271e0-4303-480c-a6e8-43d18377a518; Q5 sequencing: Phase 2 depends
--  on the Phase 1 identity spine that landed in V065). Builds on the
--  grounding decisions 1ea66b00 (schema placement) and 16a71e26
--  (identity strength — strong/medium/weak basis table).
--
--  Two new tables:
--    • asset_identity_claim — proposed identity linkage with confidence.
--      NEVER auto-merges; resolution requires owning-role decision
--      (Architect closes spec/plan; Planner closes candidate/question,
--      per Q4 of the contract). The merge-prohibition is application
--      logic and therefore NOT encoded in DDL; this table captures the
--      claim lifecycle (status, decided_by, decided_at) so the owning
--      role can close the topic auditably.
--    • asset_relation       — curated relationship layer for assets:
--      supersedes / derives_from / contradicts / consolidates_into /
--      split_from edges.
--
--  Conventions (unchanged from V057 / V065):
--    • uuid PK DEFAULT gen_random_uuid()
--    • expired_at timestamptz soft-delete (NULL ⇒ active)
--    • partial unique indexes WHERE expired_at IS NULL for natural keys
--    • inline FK REFERENCES (plain, not partial)
--    • add_ / soft_delete_ / update_ proc trio per table (append-only
--      replace on update: expire active row, insert a fresh row with a
--      new uuid id)
--    • no created_at on pure edge rows (matches representation_relationship
--      / concept_relationship); asset_identity_claim carries created_at
--      because it has a lifecycle (open → resolved/rejected) that needs
--      an audit timestamp — same shape as `drift_finding` (which has
--      detected_at) but normalized to created_at since claims can be
--      filed before any detection event.
--
--  Hooks reused (NOT recreated): V059's seeded 'Asset' concept and the
--  'canonical_asset_id' identity_strategy row stay untouched. asset_relation
--  does not FK to either; asset_identity_claim does NOT FK to
--  identity_strategy (the contract draws it as a peer of
--  representation_identity, not a refactor of it — keeping the new table
--  independent lets it carry asset-specific claim_type/confidence/basis
--  fields the generic identity_strategy machinery does not have).
--
--  Idempotent: CREATE TABLE IF NOT EXISTS, OR REPLACE for procs, guarded
--  DROP FUNCTION for re-runnability.
--
--  Usage:
--    docker exec -i pgvector_db psql -U pguser -d nexus \
--      -v ON_ERROR_STOP=1 < sql/V066__semantics_t02_phase2_relationships.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  0. SAFETY — refuse to run if Phase 2 tables already hold rows
--     (structural-only migration; no data migration planned).
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_count integer;
BEGIN
    IF to_regclass('semantics.asset_identity_claim') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM semantics.asset_identity_claim' INTO v_count;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'V066 aborted: semantics.asset_identity_claim has % row(s)', v_count;
        END IF;
    END IF;
    IF to_regclass('semantics.asset_relation') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM semantics.asset_relation' INTO v_count;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'V066 aborted: semantics.asset_relation has % row(s)', v_count;
        END IF;
    END IF;
END $$;

-- Phase 1 dependency must exist (V065 must have been applied first).
DO $$
BEGIN
    IF to_regclass('semantics.canonical_asset') IS NULL THEN
        RAISE EXCEPTION 'V066 aborted: semantics.canonical_asset does not exist (Phase 1 V065 must be applied first)';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  1. DROP pre-existing Phase 2 procs (so re-runs re-arm cleanly)
-- ═══════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS semantics.add_asset_identity_claim(uuid,uuid,uuid,text,real,text,text,text,timestamptz,timestamptz);
DROP FUNCTION IF EXISTS semantics.soft_delete_asset_identity_claim(uuid);
DROP FUNCTION IF EXISTS semantics.update_asset_identity_claim(uuid,uuid,uuid,text,real,text,text,text,timestamptz,timestamptz);

DROP FUNCTION IF EXISTS semantics.add_asset_relation(uuid,uuid,uuid,text,text,timestamptz,timestamptz,timestamptz);
DROP FUNCTION IF EXISTS semantics.soft_delete_asset_relation(uuid);
DROP FUNCTION IF EXISTS semantics.update_asset_relation(uuid,uuid,uuid,text,text,timestamptz,timestamptz,timestamptz);

-- ═══════════════════════════════════════════════════════════════════════
--  2. TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- ── asset_identity_claim ─────────────────────────────────────────────
-- Proposed identity linkage between two canonical assets, with a
-- confidence score and a basis (strong/medium/weak per Q2 of the
-- contract). The claim NEVER performs the merge — only an owning-role
-- decision resolves it (Architect for spec/plan, Planner for
-- candidate/question, per Q4). Status lifecycle: open → resolved/rejected.
-- Both endpoints are suggested-but-not-required: candidate_asset_id is
-- NULLable to allow claims that propose a new identity without a known
-- target yet.
CREATE TABLE IF NOT EXISTS semantics.asset_identity_claim (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id              uuid NOT NULL REFERENCES semantics.canonical_asset(id),
    candidate_asset_id    uuid REFERENCES semantics.canonical_asset(id),  -- NULLable — propose-without-target allowed
    claim_type            text NOT NULL,            -- identity|supersession|derivation|consolidation|split
    confidence            real,                    -- 0..1, matches evidence columns on _relationship tables
    basis                 text,                    -- strong|medium|weak (per Q2 identity strength table)
    status                text NOT NULL DEFAULT 'open',  -- open|resolved|rejected
    decided_by            text,                    -- role that closed the claim
    decided_at            timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    expired_at            timestamptz,
    -- A live claim for a given (asset_id, claim_type) is unique among active rows.
    -- Multiple open claims of the same type on the same asset would be noise;
    -- the partial index below prevents the system from registering duplicates.
    -- candidate_asset_id is INTENTIONALLY excluded from the unique key so a
    -- later claim that targets a different candidate is a separate row.
    CHECK (claim_type IN ('identity','supersession','derivation','consolidation','split')),
    CHECK (status IN ('open','resolved','rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_identity_claim_active_pair
    ON semantics.asset_identity_claim (asset_id, claim_type) WHERE expired_at IS NULL;

-- ── asset_relation ───────────────────────────────────────────────────
-- Curated relationship layer between two canonical assets. Each row is
-- a directed edge from_asset_id → to_asset_id of a given relation_type.
-- decided_by + decided_at + effective_at + expired_at capture the
-- auditable lifecycle. Append-only; corrections are new rows with
-- expired_at soft-delete (matches representation_relationship /
-- concept_relationship pattern).
CREATE TABLE IF NOT EXISTS semantics.asset_relation (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_asset_id     uuid NOT NULL REFERENCES semantics.canonical_asset(id),
    to_asset_id       uuid NOT NULL REFERENCES semantics.canonical_asset(id),
    relation_type     text NOT NULL,            -- supersedes|derives_from|contradicts|consolidates_into|split_from
    decided_by        text,
    decided_at        timestamptz,
    effective_at      timestamptz NOT NULL DEFAULT now(),
    expired_at        timestamptz,
    CHECK (from_asset_id <> to_asset_id),        -- self-loops forbidden
    CHECK (relation_type IN ('supersedes','derives_from','contradicts','consolidates_into','split_from'))
);

-- Active edge from_asset_id → to_asset_id of a given type is unique
-- (no duplicate "X supersedes Y" relations while both rows are live).
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_relation_active_edge
    ON semantics.asset_relation (from_asset_id, to_asset_id, relation_type) WHERE expired_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  3. STORED PROCEDURES — add_ / soft_delete_ / update_ trio
-- ═══════════════════════════════════════════════════════════════════════

-- ── asset_identity_claim ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION semantics.add_asset_identity_claim(
    p_id uuid DEFAULT NULL,
    p_asset_id uuid DEFAULT NULL,
    p_candidate_asset_id uuid DEFAULT NULL,
    p_claim_type text DEFAULT NULL,
    p_confidence real DEFAULT NULL,
    p_basis text DEFAULT NULL,
    p_status text DEFAULT 'open',
    p_decided_by text DEFAULT NULL,
    p_decided_at timestamptz DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.asset_identity_claim AS $$
DECLARE v_row semantics.asset_identity_claim%ROWTYPE;
BEGIN
    INSERT INTO semantics.asset_identity_claim
        (id, asset_id, candidate_asset_id, claim_type, confidence, basis,
         status, decided_by, decided_at, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_asset_id, p_candidate_asset_id,
         p_claim_type, p_confidence, p_basis, COALESCE(p_status, 'open'),
         p_decided_by, p_decided_at, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_asset_identity_claim(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.asset_identity_claim SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_asset_identity_claim(
    p_id uuid,
    p_asset_id uuid DEFAULT NULL,
    p_candidate_asset_id uuid DEFAULT NULL,
    p_claim_type text DEFAULT NULL,
    p_confidence real DEFAULT NULL,
    p_basis text DEFAULT NULL,
    p_status text DEFAULT 'open',
    p_decided_by text DEFAULT NULL,
    p_decided_at timestamptz DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.asset_identity_claim AS $$
DECLARE v_row semantics.asset_identity_claim%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.asset_identity_claim SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_asset_identity_claim: no active row with id %', p_id; END IF;
    INSERT INTO semantics.asset_identity_claim
        (id, asset_id, candidate_asset_id, claim_type, confidence, basis,
         status, decided_by, decided_at, expired_at)
    VALUES
        (gen_random_uuid(), p_asset_id, p_candidate_asset_id,
         p_claim_type, p_confidence, p_basis, COALESCE(p_status, 'open'),
         p_decided_by, p_decided_at, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ── asset_relation ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION semantics.add_asset_relation(
    p_id uuid DEFAULT NULL,
    p_from_asset_id uuid DEFAULT NULL,
    p_to_asset_id uuid DEFAULT NULL,
    p_relation_type text DEFAULT NULL,
    p_decided_by text DEFAULT NULL,
    p_decided_at timestamptz DEFAULT NULL,
    p_effective_at timestamptz DEFAULT now(),
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.asset_relation AS $$
DECLARE v_row semantics.asset_relation%ROWTYPE;
BEGIN
    INSERT INTO semantics.asset_relation
        (id, from_asset_id, to_asset_id, relation_type, decided_by,
         decided_at, effective_at, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_from_asset_id, p_to_asset_id,
         p_relation_type, p_decided_by, p_decided_at,
         COALESCE(p_effective_at, now()), p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_asset_relation(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.asset_relation SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_asset_relation(
    p_id uuid,
    p_from_asset_id uuid DEFAULT NULL,
    p_to_asset_id uuid DEFAULT NULL,
    p_relation_type text DEFAULT NULL,
    p_decided_by text DEFAULT NULL,
    p_decided_at timestamptz DEFAULT NULL,
    p_effective_at timestamptz DEFAULT now(),
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.asset_relation AS $$
DECLARE v_row semantics.asset_relation%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.asset_relation SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_asset_relation: no active row with id %', p_id; END IF;
    INSERT INTO semantics.asset_relation
        (id, from_asset_id, to_asset_id, relation_type, decided_by,
         decided_at, effective_at, expired_at)
    VALUES
        (gen_random_uuid(), p_from_asset_id, p_to_asset_id,
         p_relation_type, p_decided_by, p_decided_at,
         COALESCE(p_effective_at, now()), p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  4. VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_new_tables   integer;
    v_total_tables integer;
    v_new_fks      integer;
    v_new_procs    integer;
    v_new_active_idx integer;
    v_check_constraints integer;
BEGIN
    SELECT count(*) INTO v_new_tables
      FROM information_schema.tables
     WHERE table_schema='semantics'
       AND table_name IN ('asset_identity_claim','asset_relation');
    SELECT count(*) INTO v_total_tables FROM information_schema.tables WHERE table_schema='semantics';
    SELECT count(*) INTO v_new_fks
      FROM pg_constraint con JOIN pg_namespace nsp ON nsp.oid = con.connamespace
     WHERE con.contype='f' AND nsp.nspname='semantics'
       AND con.conname IN ('asset_identity_claim_asset_id_fkey','asset_identity_claim_candidate_asset_id_fkey',
                            'asset_relation_from_asset_id_fkey','asset_relation_to_asset_id_fkey');
    SELECT count(*) INTO v_new_procs
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='semantics'
       AND p.proname IN ('add_asset_identity_claim','soft_delete_asset_identity_claim','update_asset_identity_claim',
                         'add_asset_relation','soft_delete_asset_relation','update_asset_relation');
    SELECT count(*) INTO v_new_active_idx
      FROM pg_indexes
     WHERE schemaname='semantics'
       AND indexname IN ('idx_asset_identity_claim_active_pair','idx_asset_relation_active_edge');
    SELECT count(*) INTO v_check_constraints
      FROM pg_constraint con JOIN pg_namespace nsp ON nsp.oid = con.connamespace
     WHERE con.contype='c' AND nsp.nspname='semantics'
       AND con.conname IN ('asset_identity_claim_claim_type_check','asset_identity_claim_status_check',
                            'asset_relation_check','asset_relation_relation_type_check');

    RAISE NOTICE 'new_tables=%, total_tables=%, new_fks=%, new_procs=%, new_active_unique_indexes=%, check_constraints=%',
                 v_new_tables, v_total_tables, v_new_fks, v_new_procs, v_new_active_idx, v_check_constraints;

    IF v_new_tables <> 2 THEN RAISE EXCEPTION 'V066 verify: expected 2 new tables, got %', v_new_tables; END IF;
    IF v_new_fks <> 4 THEN RAISE EXCEPTION 'V066 verify: expected 4 new FKs, got %', v_new_fks; END IF;
    IF v_new_procs <> 6 THEN RAISE EXCEPTION 'V066 verify: expected 6 new procs, got %', v_new_procs; END IF;
    IF v_new_active_idx <> 2 THEN RAISE EXCEPTION 'V066 verify: expected 2 active-only unique indexes, got %', v_new_active_idx; END IF;
    IF v_check_constraints <> 4 THEN RAISE EXCEPTION 'V066 verify: expected 4 CHECK constraints, got %', v_check_constraints; END IF;

    RAISE NOTICE '✅ V066 applied — T02 Phase 2 relationship layer live (asset_identity_claim + asset_relation).';
END $$;

COMMIT;

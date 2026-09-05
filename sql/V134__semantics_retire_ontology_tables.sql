-- =============================================================================
-- V134: Retire the 9 duplicated ontology tables from nexus.semantics
-- =============================================================================
-- Operator directive (2026-09-01): nexus/semantics schema converges to the
-- sol/semantics shape (12 shared tables). The 9 tables below are owned by
-- resolution.* as the evaluation model; the semantics copies are the inert
-- first take (reconciliation record f3320458; convergence analysis 364913d3;
-- sol-workspace/transform.py already excludes them from the standalone sol
-- schema).
--
-- ⚠️ STATUS: APPLIED + LEDGERED (2026-09-05). See the "Execution record"
-- block below. The prior "DRAFT — NOT AUTHORIZED TO RUN" warning reflected
-- pre-execution state; this migration is now confirmed live on titanium and
-- recorded in resolution.migration_ledger (label
-- V134_semantics_retire_ontology_tables). V116/V120 are marked superseded.
--
-- Execution record (2026-09-05): V134 was committed to main 2026-09-01
-- 15:37 EDT (commit 30221fc6) and its effects are present in the live DB
-- (check_statement_id → resolution.*; 9 semantics ontology tables absent;
-- 36 legacy statement_evidence rows soft-expired; statement_evidence_type
-- _check trimmed with the OR expired_at IS NOT NULL escape). The CI
-- bootstrap (nexus-ci-bootstrap.sql) carries the same post-V134 state.
-- Ledgered retroactively by architect (record e32a856c) after DBA proposal
-- 7d9b5837 (V116/V087 restore) was ruled NOT APPROVED.
--
-- Data note: the 336 rows in these tables are NOT UUID-duplicated in
-- resolution (natural-key overlap is partial — e.g. 19 semantics concepts vs
-- 30 resolution, 7 shared names; the 74 semantics representations are a fleet
-- legend). The semantics-only rows (topology concepts, richer owning_subsystem
-- vocabulary, legend representations, 19-type relationship vocabulary) are
-- NOT recoverable from resolution after this migration. DBA must confirm that
-- loss is intended before running.
--
-- Table                        | semantics rows (2026-09-01) | resolution rows
-- owning_subsystem             | 16 (ID 1-6 names CONFLICT)  | 6
-- concept                      | 19 | 30
-- concept_relationship         | 44 | 15
-- representation               | 74 | 16
-- representation_identity      | 35 | 6
-- representation_relationship  | 51 | 3
-- identity_strategy            | 6  | 7
-- consumer_operation           | 90 | 5
-- execution_claim              | 1  | 1
-- =============================================================================

BEGIN;

-- ── 0. Pre-flight guards (fail loudly, roll back — never partial) ──────────
DO $$
DECLARE
    missing text := '';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'resolution' AND c.relname = 'concept'
    ) THEN missing := missing || ' resolution.concept'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'resolution' AND c.relname = 'concept_relationship'
    ) THEN missing := missing || ' resolution.concept_relationship'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'resolution' AND c.relname = 'representation'
    ) THEN missing := missing || ' resolution.representation'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'resolution' AND c.relname = 'execution_claim'
    ) THEN missing := missing || ' resolution.execution_claim'; END IF;

    IF missing <> '' THEN
        RAISE EXCEPTION 'V134 pre-flight FAILED — authoritative resolution.* tables missing:% (do not retire semantics copies)', missing;
    END IF;

    RAISE NOTICE 'V134 pre-flight OK: resolution.* authoritative tables present; retirement is safe to continue';
END $$;

-- ── 1. Drop the FK from the KEPT snapshot_observation into the retiring
--       semantics.representation (column is retained, matching sol.semantics;
--       the id becomes historical). ─────────────────────────────────────────
ALTER TABLE semantics.snapshot_observation
    DROP CONSTRAINT IF EXISTS snapshot_observation_representation_id_fkey;

-- ── 2. Repoint semantics.check_statement_id at resolution.* (mirrors the
--       sol-workspace/transform.py rewrite): removes the nebula/conduit-coupled
--       branches (agent_record, work_request, implementation_plan,
--       harvest_candidate) and validates the retired ontology statement types
--       against resolution instead of semantics. The trigger
--       trg_statement_evidence_check_statement keeps firing. ────────────────
CREATE OR REPLACE FUNCTION semantics.check_statement_id()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    found boolean;
BEGIN
    CASE NEW.statement_type
        WHEN 'source_observation' THEN
            SELECT EXISTS(SELECT 1 FROM semantics.source_observation WHERE id = NEW.statement_id) INTO found;
        WHEN 'representation_relationship' THEN
            SELECT EXISTS(SELECT 1 FROM resolution.representation_relationship WHERE id = NEW.statement_id) INTO found;
        WHEN 'concept_relationship' THEN
            SELECT EXISTS(SELECT 1 FROM resolution.concept_relationship WHERE id = NEW.statement_id) INTO found;
        WHEN 'execution_claim' THEN
            SELECT EXISTS(SELECT 1 FROM resolution.execution_claim WHERE id = NEW.statement_id) INTO found;
        WHEN 'resolution_proposition' THEN
            SELECT EXISTS(SELECT 1 FROM resolution.proposition WHERE id = NEW.statement_id) INTO found;
        ELSE
            RAISE EXCEPTION 'Unknown statement_type: %', NEW.statement_type;
    END CASE;

    IF NOT found THEN
        RAISE EXCEPTION 'Polymorphic resolution failed: no row in % with id %',
            NEW.statement_type, NEW.statement_id;
    END IF;

    RETURN NEW;
END;
$function$;

-- ── 3. Trim statement_evidence.statement_type CHECK to the sol vocabulary
--       (removes the nebula/conduit statement types). ───────────────────────
-- Existing nexus-coupled rows (statement_type agent_record / work_request /
-- implementation_plan / harvest_candidate — 36 live rows on 2026-09-01:
-- agent_record 19, implementation_plan 17) reference nebula tables that are
-- NOT part of the retired set, but their statement types are not in the sol
-- vocabulary. They are EXPIRED (soft-delete — append-only philosophy, no hard
-- delete) so they become read-only history. The re-added CHECK is conditional:
-- LIVE rows must be sol statement types; expired rows may retain legacy types
-- (a CHECK applies to all rows, so plain expiry alone cannot satisfy it). This
-- is the append-only-compatible equivalent of sol's plain CHECK (which works
-- there only because sol has 0 rows). The check trigger is disabled around the
-- UPDATE because the rewritten check_statement_id (step 2) no longer
-- recognizes the retired statement types; it is re-enabled immediately after.
ALTER TABLE semantics.statement_evidence
    DISABLE TRIGGER trg_statement_evidence_check_statement;
UPDATE semantics.statement_evidence
   SET expired_at = now()
 WHERE expired_at IS NULL
   AND statement_type IN ('agent_record','work_request','implementation_plan','harvest_candidate');
ALTER TABLE semantics.statement_evidence
    ENABLE TRIGGER trg_statement_evidence_check_statement;

ALTER TABLE semantics.statement_evidence
    DROP CONSTRAINT IF EXISTS statement_evidence_type_check;
ALTER TABLE semantics.statement_evidence
    ADD CONSTRAINT statement_evidence_type_check
    CHECK (
        statement_type = ANY (ARRAY[
            'source_observation'::text,
            'representation_relationship'::text,
            'concept_relationship'::text,
            'execution_claim'::text,
            'resolution_proposition'::text
        ])
        OR expired_at IS NOT NULL
    );

-- ── 4. Drop the 27 CRUD procs for the retired tables (exact signatures; the
--       add_/update_representation_relationship pair has TWO overloads each —
--       both are dropped). ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS semantics.add_consumer_operation(uuid,uuid,text,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.update_consumer_operation(uuid,uuid,text,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.soft_delete_consumer_operation(uuid);

DROP FUNCTION IF EXISTS semantics.add_representation_identity(uuid,uuid,uuid,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.update_representation_identity(uuid,uuid,uuid,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.soft_delete_representation_identity(uuid);

DROP FUNCTION IF EXISTS semantics.add_representation_relationship(uuid,uuid,uuid,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.update_representation_relationship(uuid,uuid,uuid,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.add_representation_relationship(uuid,uuid,uuid,text,text,text,text,numeric,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.update_representation_relationship(uuid,uuid,uuid,text,text,text,text,numeric,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.soft_delete_representation_relationship(uuid);

DROP FUNCTION IF EXISTS semantics.add_identity_strategy(uuid,uuid,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.update_identity_strategy(uuid,uuid,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.soft_delete_identity_strategy(uuid);

DROP FUNCTION IF EXISTS semantics.add_concept_relationship(uuid,uuid,uuid,text,text,text,text,text,numeric,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.update_concept_relationship(uuid,uuid,uuid,text,text,text,text,text,numeric,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.soft_delete_concept_relationship(uuid);

DROP FUNCTION IF EXISTS semantics.add_representation(uuid,uuid,text,text,text,smallint,text,jsonb,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.update_representation(uuid,uuid,text,text,text,smallint,text,jsonb,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.soft_delete_representation(uuid);

DROP FUNCTION IF EXISTS semantics.add_concept(uuid,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.update_concept(uuid,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.soft_delete_concept(uuid);

DROP FUNCTION IF EXISTS semantics.add_owning_subsystem(smallint,text,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.update_owning_subsystem(smallint,smallint,text,text,text,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.soft_delete_owning_subsystem(smallint);

DROP FUNCTION IF EXISTS semantics.add_execution_claim(uuid,uuid,text,text,jsonb,text,jsonb,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,timestamp with time zone,jsonb,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.update_execution_claim(uuid,uuid,text,text,jsonb,text,jsonb,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,timestamp with time zone,jsonb,timestamp with time zone);
DROP FUNCTION IF EXISTS semantics.soft_delete_execution_claim(uuid);

-- ── 5. Drop the 9 tables in dependency order. NO CASCADE — if an unexpected
--       dependent (view, FK from another schema) appeared since review, the
--       DROP fails and the whole transaction rolls back. ────────────────────
DROP TABLE IF EXISTS semantics.consumer_operation;
DROP TABLE IF EXISTS semantics.representation_identity;
DROP TABLE IF EXISTS semantics.representation_relationship;
DROP TABLE IF EXISTS semantics.identity_strategy;
DROP TABLE IF EXISTS semantics.concept_relationship;
DROP TABLE IF EXISTS semantics.representation;
DROP TABLE IF EXISTS semantics.concept;
DROP TABLE IF EXISTS semantics.owning_subsystem;
DROP TABLE IF EXISTS semantics.execution_claim;

-- ── 6. Post-condition verification ─────────────────────────────────────────
DO $$
DECLARE
    leftover integer;
    kept_count integer;
BEGIN
    SELECT count(*) INTO leftover FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'semantics' AND c.relkind = 'r' AND c.relname IN (
        'owning_subsystem','concept','concept_relationship','representation',
        'representation_identity','representation_relationship','identity_strategy',
        'consumer_operation','execution_claim'
    );
    IF leftover > 0 THEN
        RAISE EXCEPTION 'V134 post-check FAILED — % retired table(s) still present', leftover;
    END IF;

    SELECT count(*) INTO kept_count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'semantics' AND c.relkind = 'r';
    RAISE NOTICE 'V134 OK: 9 ontology tables retired, 27 CRUD procs dropped, snapshot_observation FK dropped, check_statement_id repointed at resolution.* — semantics now has % tables', kept_count;
END $$;

COMMIT;

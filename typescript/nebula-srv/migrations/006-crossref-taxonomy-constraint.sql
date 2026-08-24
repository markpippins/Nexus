-- Migration 006: Cross-Reference Taxonomy Constraint
-- Adds CHECK constraint on nebula.cross_references.rel_type to enforce
-- the formal rel_type enumeration from CROSSREF_TAXONOMY.md (plan #0175).
--
-- Declared valid rel_type values (from schemas/ontology/relationships/wrp-crossref-taxonomy.jsonld):
--
--   WRP domain:  wrp:depends_on, wrp:implements, wrp:tracked_by, wrp:impacts_system, wrp:supersedes
--   Agent domain: ag:references_plan, ag:same_thread_as, ag:prompted_by, ag:spawns_plan
--   Knowledge:    kv:sourced_from, kv:informs, kv:cross_schema, kv:name_overlap, kv:description_overlap
--
-- Also backfills legacy 'depends_on' (no prefix) → 'wrp:depends_on'.

SET search_path TO nebula;

-- ── 1. Backfill legacy values ─────────────────────────────────────────

UPDATE nebula.cross_references
   SET rel_type = 'wrp:depends_on'
 WHERE rel_type = 'depends_on';

-- ── 2. Add CHECK constraint (idempotent via DO block) ──────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_cross_references_rel_type'
          AND conrelid = 'nebula.cross_references'::regclass
    ) THEN
        ALTER TABLE nebula.cross_references
            ADD CONSTRAINT chk_cross_references_rel_type
            CHECK (rel_type IN (
                'wrp:depends_on',
                'wrp:implements',
                'wrp:tracked_by',
                'wrp:impacts_system',
                'wrp:supersedes',
                'ag:references_plan',
                'ag:same_thread_as',
                'ag:prompted_by',
                'ag:spawns_plan',
                'kv:sourced_from',
                'kv:informs',
                'kv:cross_schema',
                'kv:name_overlap',
                'kv:description_overlap'
            ));
    END IF;
END $$;
